import os
import re
import json
import difflib
from fastapi import FastAPI, BackgroundTasks, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Dict, Any

# Импортируем наши парсеры
from scraper import run_scraper, DATA_FILE
from scraper_forma import run_forma_scraper, FORMA_DATA_FILE

app = FastAPI(title="Price Monitor API", description="API для управления парсингом цен конкурентов")

# Настройка CORS для работы с React (Vite)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # В продакшене лучше указать конкретные домены
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class ScraperStatus(BaseModel):
    status: str
    message: str

def bg_scraper_task(max_pages: int):
    # Запуск парсера конкурента "Космея"
    try:
        print("Запуск парсера конкурента (Космея)...")
        run_scraper()
    except Exception as e:
        print(f"Ошибка в фоновом процессе парсинга Космеи: {e}")

    # Запуск парсера своего салона "Форма"
    try:
        print("Запуск парсера салона (Форма)...")
        run_forma_scraper()
    except Exception as e:
        print(f"Ошибка в фоновом процессе парсинга Формы: {e}")

@app.get("/")
def read_root():
    return {"status": "ok", "service": "Price Monitor API"}

@app.post("/api/parser/run", response_model=ScraperStatus)
def trigger_parser(background_tasks: BackgroundTasks, max_pages: int = 2):
    """Запускает процесс парсинга в фоновом режиме."""
    background_tasks.add_task(bg_scraper_task, max_pages)
    return {
        "status": "started",
        "message": "Парсинг цен конкурента (Космея) и салона (Форма) запущен в фоновом режиме."
    }

@app.get("/api/parser/results")
def get_results() -> List[Dict[str, Any]]:
    """Возвращает список всех спарсенных товаров конкурента Космея."""
    if not os.path.exists(DATA_FILE):
        return []
    
    try:
        with open(DATA_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
        return list(data.values())
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ошибка чтения данных Космеи: {str(e)}")

@app.get("/api/parser/forma-results")
def get_forma_results() -> List[Dict[str, Any]]:
    """Возвращает список всех спарсенных услуг салона Форма."""
    if not os.path.exists(FORMA_DATA_FILE):
        return []
    
    try:
        with open(FORMA_DATA_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
        return list(data.values())
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ошибка чтения данных Формы: {str(e)}")

def get_numeric_price(price_str: str) -> int:
    """Извлекает первое числовое значение из строки цены (например, '900-1000 руб' -> 900)."""
    if not price_str:
        return 0
    # Удаляем пробелы
    price_str = price_str.replace(" ", "").replace("\xa0", "")
    numbers = re.findall(r'\d+', price_str)
    if numbers:
        return int(numbers[0])
    return 0

@app.get("/api/parser/comparison")
def get_comparison() -> List[Dict[str, Any]]:
    """Сопоставляет услуги Формы и Космеи по нечеткому совпадению названий."""
    if not os.path.exists(DATA_FILE) or not os.path.exists(FORMA_DATA_FILE):
        return []
        
    try:
        with open(DATA_FILE, "r", encoding="utf-8") as f:
            kosmeya_db = json.load(f)
        with open(FORMA_DATA_FILE, "r", encoding="utf-8") as f:
            forma_db = json.load(f)
            
        kosmeya_items = list(kosmeya_db.values())
        forma_items = list(forma_db.values())
        
        comparison = []
        
        for forma_item in forma_items:
            best_match = None
            best_ratio = 0.0
            
            # Ищем лучшее совпадение среди товаров Космеи
            for kosmeya_item in kosmeya_items:
                # Ограничиваем нечеткий поиск разумными пределами (сравниваем названия в нижнем регистре)
                ratio = difflib.SequenceMatcher(None, forma_item["title"].lower(), kosmeya_item["title"].lower()).ratio()
                if ratio > best_ratio:
                    best_ratio = ratio
                    best_match = kosmeya_item
            
            # Если совпадение достаточно хорошее (порог 0.58)
            if best_match and best_ratio >= 0.58:
                forma_price_num = get_numeric_price(forma_item["price_raw"])
                competitor_price_num = get_numeric_price(best_match["price_raw"])
                price_difference = competitor_price_num - forma_price_num
                
                comparison.append({
                    "forma_title": forma_item["title"],
                    "forma_category": forma_item["category"],
                    "forma_price": forma_item["price_raw"],
                    "forma_price_num": forma_price_num,
                    "competitor_title": best_match["title"],
                    "competitor_price": best_match["price_raw"],
                    "competitor_price_num": competitor_price_num,
                    "price_difference": price_difference,
                    "url": best_match["url"],
                    "similarity": round(best_ratio, 2)
                })
                
        # Сортируем сравнение по разнице в ценах (чтобы сначала шли самые выгодные для повышения цены)
        comparison.sort(key=lambda x: x["price_difference"], reverse=True)
        return comparison
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ошибка построения сравнения: {str(e)}")

@app.get("/api/parser/history")
def get_history() -> Dict[str, List[Dict[str, Any]]]:
    """Возвращает историю изменения цен для всех товаров Космеи, у которых были изменения."""
    if not os.path.exists(DATA_FILE):
        return {}
        
    try:
        with open(DATA_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
            
        history_db = {}
        for key, item in data.items():
            title = item.get("title", key)
            if item.get("history"):
                history_db[title] = item["history"] + [{"price_raw": item["price_raw"], "date": item["last_updated"]}]
        return history_db
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ошибка чтения истории: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    # Trigger uvicorn reload to load new env vars
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
