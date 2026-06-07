import os
import re
import sys
import json
import requests
from bs4 import BeautifulSoup
from datetime import datetime

sys.stdout.reconfigure(encoding='utf-8')

# Базовый URL и список страниц услуг
BASE_URL = "https://xn----8sbnticlcfyd0o.xn--p1ai/"
PAGES = {
    "parikmaherskaya.html": "Парикмахерские услуги",
    "makiyazh.html": "Макияж",
    "nogtevoj_servis.html": "Ногтевой сервис",
    "kosmetologicheskie_uslugi.html": "Аппаратная косметология",
    "inekcionnaya_kosmetologiya.html": "Инъекционная косметология",
    "estetika_kosmetologiya.html": "Эстетическая косметология",
    "udalenie.html": "Удаление новообразований"
}

DATA_FILE = os.path.join(os.path.dirname(__file__), "scraped_data.json")

def parse_price_value(price_str):
    """Очищает строку цены и пытается извлечь числовое значение (или диапазон)."""
    # Удаляем пробелы, валюту и лишние знаки
    cleaned = price_str.replace("руб", "").replace("руб.", "").replace(" ", "").replace("\xa0", "").strip()
    return cleaned

def run_scraper():
    print(f"[{datetime.now().strftime('%H:%M:%S')}] Запуск парсинга сайта салона красоты Космея ({BASE_URL})...")
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
            
            # Находим все элементы, содержащие цену
            # В Adobe Muse это обычно строки, заканчивающиеся на "руб" или "руб."
            price_elements = soup.find_all(string=re.compile(r'\d+\s*(?:/\s*\d+)?\s*руб'))
            print(f"Найдено позиций в категории '{category}': {len(price_elements)}")
            
            for el in price_elements:
                price_text = el.strip()
                price_val = parse_price_value(price_text)
                
                # Поиск имени услуги через предыдущие сиблинги в DOM
                service_name = "Неизвестная услуга"
                price_tag = el.parent
                
                curr = price_tag
                found = False
                
                for _ in range(3):
                    if not curr:
                        break
                    sibling = curr.previous_sibling
                    while sibling:
                        if sibling.name in ['div', 'a', 'p', 'span']:
                            sib_text = sibling.get_text(" ", strip=True)
                            # Игнорируем цены, номера телефонов и системные сообщения форм
                            if sib_text and "руб" not in sib_text and "номер" not in sib_text and "Форма" not in sib_text and "Отправка" not in sib_text and len(sib_text) > 3:
                                sib_text = re.sub(r'\s+', ' ', sib_text)
                                service_name = sib_text
                                found = True
                                break
                        sibling = sibling.previous_sibling
                    if found:
                        break
                    curr = curr.parent
                
                # Добавляем в общий список
                all_parsed_items.append({
                    "title": service_name,
                    "price_raw": price_text,
                    "price_value": price_val,
                    "category": category,
                    "url": url
                })
                
        except Exception as e:
            print(f"Ошибка при парсинге страницы {page_name}: {e}")
            
    print(f"Парсинг завершен. Всего найдено позиций: {len(all_parsed_items)}")
    save_results(all_parsed_items)
    return all_parsed_items

def save_results(new_items):
    """Сохраняет результаты в JSON, сравнивая с предыдущими для отслеживания истории цен."""
    now_str = datetime.now().isoformat()
    
    if os.path.exists(DATA_FILE):
        try:
            with open(DATA_FILE, "r", encoding="utf-8") as f:
                db = json.load(f)
        except Exception:
            db = {}
    else:
        db = {}
        
    updated_db = {}
    
    for item in new_items:
        # Уникальный ключ по категории и названию услуги
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
                print(f"📈 Изменилась цена: {item['category']} -> {item['title']}: {last_price} -> {price_raw}")
                
                # Отправка уведомления в Telegram
                try:
                    from telegram_utils import send_telegram_message, format_price_change_message
                    msg = format_price_change_message(
                        category=item['category'],
                        title=item['title'],
                        old_price=last_price,
                        new_price=price_raw,
                        url=item['url']
                    )
                    send_telegram_message(msg)
                except Exception as tg_err:
                    print(f"Ошибка отправки Telegram-уведомления: {tg_err}")
                
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
            
    with open(DATA_FILE, "w", encoding="utf-8") as f:
        json.dump(updated_db, f, indent=4, ensure_ascii=False)
        
    print(f"Данные успешно сохранены в {DATA_FILE}")

if __name__ == "__main__":
    run_scraper()
