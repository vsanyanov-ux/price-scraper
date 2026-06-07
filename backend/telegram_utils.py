import os
import requests
from dotenv import load_dotenv

# Загружаем переменные из .env
env_path = os.path.join(os.path.dirname(__file__), ".env")
load_dotenv(env_path)

TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")
TELEGRAM_CHAT_ID = os.getenv("TELEGRAM_CHAT_ID")

def send_telegram_message(message: str) -> bool:
    """Отправляет текстовое сообщение в Telegram."""
    if not TELEGRAM_BOT_TOKEN or not TELEGRAM_CHAT_ID:
        print(f"[Telegram] Бот не настроен (проверьте TELEGRAM_BOT_TOKEN и TELEGRAM_CHAT_ID в .env). Сообщение: {message}")
        return False
        
    url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage"
    payload = {
        "chat_id": TELEGRAM_CHAT_ID,
        "text": message,
        "parse_mode": "HTML",
        "disable_web_page_preview": True
    }
    
    try:
        response = requests.post(url, json=payload, timeout=10)
        if response.status_code == 200:
            print("[Telegram] Уведомление успешно отправлено!")
            return True
        else:
            print(f"[Telegram] Ошибка отправки: статус {response.status_code}, ответ: {response.text}")
            return False
    except Exception as e:
        print(f"[Telegram] Исключение при отправке: {e}")
        return False

def format_price_change_message(category: str, title: str, old_price: str, new_price: str, url: str) -> str:
    """Форматирует красивое HTML-сообщение об изменении цены конкурента."""
    return (
        f"🔔 <b>Изменение цены у конкурента!</b>\n\n"
        f"<b>Салон:</b> Космея\n"
        f"<b>Категория:</b> {category}\n"
        f"<b>Услуга:</b> {title}\n\n"
        f"📈 <b>Было:</b> {old_price}\n"
        f"🔥 <b>Стало:</b> {new_price}\n\n"
        f"🔗 <a href='{url}'>Ссылка на сайт конкурента</a>"
    )
