import os
import re
import sys
import json
import requests
from bs4 import BeautifulSoup
from datetime import datetime

sys.stdout.reconfigure(encoding='utf-8')

BASE_URL = "https://forma-olgapotapova.ru/"

PAGES = {
    "parikmaherskiy-zal": "Парикмахерский зал",
    "nogtevoy-servis-1": "Ногтевой сервис",
    "brovi-resnitsy": "Брови/Ресницы",
    "permanentnyy-makiyazh": "Перманентный макияж",
    "podologiya-1": "Подология",
    "esteticheskaya-kosmetologiya-1": "Эстетическая косметология",
    "lazernaya-epilyatsiya-1": "Лазерная эпиляция",
    "solyariy-2": "Солярий",
    "shugaring-1": "Шугаринг",
    "pirsing": "Пирсинг",
    "massazh": "Массаж",
    "spa-protsedury": "SPA-процедуры",
    "vizazh": "Визаж",
    "kapelnitsy": "Капельницы",
    "lpg-massazh": "LPG - массаж",
    "udalenie-tatuazha-i-tatu": "Удаление татуажа и татуировок"
}

FORMA_DATA_FILE = os.path.join(os.path.dirname(__file__), "forma_data.json")

def parse_price_value(price_str):
    """Очищает строку цены и пытается извлечь числовое значение."""
    cleaned = price_str.replace("руб", "").replace("руб.", "").replace(" ", "").replace("\xa0", "").strip()
    return cleaned

def run_forma_scraper():
    print(f"[{datetime.now().strftime('%H:%M:%S')}] Запуск парсинга сайта салона красоты Форма ({BASE_URL})...")
    session = requests.Session()
    session.headers.update({
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    })
    
    all_parsed_items = []
    
    for page_name, category in PAGES.items():
        url = f"{BASE_URL}{page_name}"
        print(f"Парсинг категории '{category}' ({url})...")
        
        try:
            response = session.get(url, timeout=15)
            if response.status_code != 200:
                print(f"Ошибка загрузки страницы {page_name}: статус {response.status_code}")
                continue
                
            soup = BeautifulSoup(response.content, "html.parser")
            
            # Находим все dt элементы с классами, содержащими item__service (структура Bazium)
            found_on_page = 0
            for dt in soup.find_all('dt'):
                classes = dt.get('class', [])
                if any('item__service' in c for c in classes):
                    service_name = dt.get_text(" ", strip=True)
                    
                    # Ищем соответствующий dd с ценой
                    dd = dt.find_next_sibling('dd')
                    if dd and any('item__price' in c for c in dd.get('class', [])):
                        price_text = dd.get_text(" ", strip=True)
                        price_val = parse_price_value(price_text)
                        
                        all_parsed_items.append({
                            "title": service_name,
                            "price_raw": price_text,
                            "price_value": price_val,
                            "category": category,
                            "url": url
                        })
                        found_on_page += 1
                        
            print(f"Найдено позиций в категории '{category}': {found_on_page}")
            
        except Exception as e:
            print(f"Ошибка при парсинге страницы {page_name}: {e}")
            
    print(f"Парсинг салона Форма завершен. Всего найдено позиций: {len(all_parsed_items)}")
    save_forma_results(all_parsed_items)
    return all_parsed_items

def save_forma_results(new_items):
    """Сохраняет результаты в JSON с историей изменений."""
    now_str = datetime.now().isoformat()
    
    if os.path.exists(FORMA_DATA_FILE):
        try:
            with open(FORMA_DATA_FILE, "r", encoding="utf-8") as f:
                db = json.load(f)
        except Exception:
            db = {}
    else:
        db = {}
        
    updated_db = {}
    
    for item in new_items:
        key = f"{item['category']}|||{item['title']}"
        price_raw = item["price_raw"]
        
        if key in db:
            existing_item = db[key]
            history = existing_item.get("history", [])
            last_price = existing_item.get("price_raw")
            
            # Если цена изменилась
            if price_raw != last_price:
                history.append({
                    "price_raw": last_price,
                    "date": existing_item.get("last_updated", now_str)
                })
                print(f"📈 [Форма] Изменилась цена: {item['category']} -> {item['title']}: {last_price} -> {price_raw}")
                
            updated_db[key] = {
                **item,
                "history": history,
                "last_updated": now_str,
                "price_changed": price_raw != last_price
            }
        else:
            # Новая услуга
            updated_db[key] = {
                **item,
                "history": [],
                "last_updated": now_str,
                "price_changed": False
            }
            
    with open(FORMA_DATA_FILE, "w", encoding="utf-8") as f:
        json.dump(updated_db, f, indent=4, ensure_ascii=False)
        
    print(f"Данные салона Форма успешно сохранены в {FORMA_DATA_FILE}")

if __name__ == "__main__":
    run_forma_scraper()
