import React, { useState, useEffect } from 'react';
import { 
  TrendingUp, 
  Search, 
  RefreshCw, 
  Download, 
  Layers, 
  CheckCircle, 
  AlertCircle, 
  X, 
  DollarSign, 
  Scissors,
  ExternalLink,
  ArrowRight
} from 'lucide-react';
import { 
  ResponsiveContainer, 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  Tooltip, 
  CartesianGrid 
} from 'recharts';
import './App.css';

const API_BASE = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' ? 'http://127.0.0.1:8000' : window.location.origin;

function App() {
  const [activeTab, setActiveTab] = useState('competitor'); // 'competitor', 'forma', 'comparison'
  const [services, setServices] = useState([]); // Космея
  const [formaServices, setFormaServices] = useState([]); // Форма
  const [comparisonData, setComparisonData] = useState([]); // Сравнение
  
  const [historyData, setHistoryData] = useState({});
  const [categories, setCategories] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState('Все');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterChanged, setFilterChanged] = useState('all'); // 'all', 'changed'
  
  const [apiOnline, setApiOnline] = useState(false);
  const [isScraping, setIsScraping] = useState(false);
  const [selectedService, setSelectedService] = useState(null);
  
  // Статистика
  const [stats, setStats] = useState({
    totalCompetitor: 0,
    totalForma: 0,
    matchedCount: 0,
    potentialProfitCount: 0
  });

  // Проверка статуса API и загрузка данных
  const checkStatusAndLoad = async () => {
    try {
      const res = await fetch(`${API_BASE}/`);
      if (res.ok) {
        setApiOnline(true);
        loadData();
      } else {
        setApiOnline(false);
      }
    } catch (err) {
      setApiOnline(false);
    }
  };

  const loadData = async () => {
    try {
      // 1. Загрузка результатов конкурента
      const resultsRes = await fetch(`${API_BASE}/api/parser/results`);
      const resultsData = await resultsRes.json();
      setServices(resultsData);

      // Выделяем уникальные категории конкурента
      const cats = ['Все', ...new Set(resultsData.map(s => s.category))];
      setCategories(cats);

      // 2. Загрузка истории конкурента
      const historyRes = await fetch(`${API_BASE}/api/parser/history`);
      const histData = await historyRes.json();
      setHistoryData(histData);

      // 3. Загрузка результатов Формы
      const formaRes = await fetch(`${API_BASE}/api/parser/forma-results`);
      let formaData = [];
      if (formaRes.ok) {
        formaData = await formaRes.json();
        setFormaServices(formaData);
      }

      // 4. Загрузка сравнения
      const comparisonRes = await fetch(`${API_BASE}/api/parser/comparison`);
      let compData = [];
      if (comparisonRes.ok) {
        compData = await comparisonRes.json();
        setComparisonData(compData);
      }

      // Расчет статистики
      calculateStats(resultsData, formaData, compData);
    } catch (err) {
      console.error('Ошибка загрузки данных:', err);
    }
  };

  const calculateStats = (compServices, ownServices, compData) => {
    const totalCompetitor = compServices.length;
    const totalForma = ownServices.length;
    const matchedCount = compData.length;
    
    // Считаем услуги Формы, которые стоят дешевле, чем у конкурента (резерв повышения)
    const potentialProfitCount = compData.filter(c => c.price_difference > 0).length;

    setStats({
      totalCompetitor,
      totalForma,
      matchedCount,
      potentialProfitCount
    });
  };

  useEffect(() => {
    checkStatusAndLoad();
    // Опрашиваем бэкенд каждые 10 секунд
    const timer = setInterval(checkStatusAndLoad, 10000);
    return () => clearInterval(timer);
  }, []);

  // Запуск парсера
  const triggerScraper = async () => {
    setIsScraping(true);
    try {
      const res = await fetch(`${API_BASE}/api/parser/run`, {
        method: 'POST',
      });
      if (res.ok) {
        alert('Парсеры успешно запущены в фоновом режиме! Данные обновятся в течение минуты.');
        setTimeout(loadData, 5000);
      }
    } catch (err) {
      alert('Не удалось запустить парсер.');
    } finally {
      setIsScraping(false);
    }
  };

  // Экспорт в CSV
  const exportToCSV = () => {
    let dataToExport = [];
    let headers = [];
    let filename = '';

    if (activeTab === 'competitor') {
      dataToExport = filteredServices;
      headers = ['Категория', 'Название услуги', 'Текущая цена (Космея)', 'URL страницы'];
      filename = 'kosmeya_prices';
    } else if (activeTab === 'forma') {
      dataToExport = filteredFormaServices;
      headers = ['Категория', 'Название услуги', 'Текущая цена (Форма)', 'URL страницы'];
      filename = 'forma_prices';
    } else {
      dataToExport = filteredComparison;
      headers = ['Категория', 'Название услуги (Форма)', 'Цена (Форма)', 'Совпадение (Космея)', 'Цена (Космея)', 'Разница'];
      filename = 'price_comparison';
    }

    if (dataToExport.length === 0) return;

    let rows = [];
    if (activeTab === 'comparison') {
      rows = dataToExport.map(s => [
        s.forma_category,
        s.forma_title,
        s.forma_price,
        s.competitor_title,
        s.competitor_price,
        s.price_difference + ' ₽'
      ]);
    } else {
      rows = dataToExport.map(s => [
        s.category,
        s.title,
        s.price_raw,
        s.url
      ]);
    }

    const csvContent = "data:text/csv;charset=utf-8,\uFEFF" 
      + [headers.join(','), ...rows.map(e => e.map(val => `"${val.replace(/"/g, '""')}"`).join(','))].join('\n');
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `${filename}_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Фильтрация для конкурента
  const filteredServices = services.filter(service => {
    const matchCategory = selectedCategory === 'Все' || service.category === selectedCategory;
    const matchSearch = service.title.toLowerCase().includes(searchQuery.toLowerCase());
    const matchChanged = filterChanged === 'all' || (filterChanged === 'changed' && service.price_changed);
    return matchCategory && matchSearch && matchChanged;
  });

  // Фильтрация для Формы
  const filteredFormaServices = formaServices.filter(service => {
    const formaCategories = ['Все', ...new Set(formaServices.map(s => s.category))];
    const matchCategory = selectedCategory === 'Все' || service.category === selectedCategory;
    const matchSearch = service.title.toLowerCase().includes(searchQuery.toLowerCase());
    const matchChanged = filterChanged === 'all' || (filterChanged === 'changed' && service.price_changed);
    return matchCategory && matchSearch && matchChanged;
  });

  // Фильтрация для Сравнения
  const filteredComparison = comparisonData.filter(item => {
    const matchSearch = item.forma_title.toLowerCase().includes(searchQuery.toLowerCase()) || 
                        item.competitor_title.toLowerCase().includes(searchQuery.toLowerCase());
    return matchSearch;
  });

  const getChartData = (title) => {
    const hist = historyData[title] || [];
    if (hist.length === 0) {
      const current = services.find(s => s.title === title);
      if (!current) return [];
      
      const numbers = current.price_raw.match(/\d+/g);
      const priceVal = numbers ? Number(numbers[0]) : 0;
      return [{
        date: new Date(current.last_updated).toLocaleDateString('ru-RU'),
        'Цена (руб)': priceVal
      }];
    }

    return hist.map(h => {
      const numbers = h.price_raw.match(/\d+/g);
      const priceVal = numbers ? Number(numbers[0]) : 0;
      return {
        date: new Date(h.date).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit' }),
        'Цена (руб)': priceVal
      };
    });
  };

  return (
    <div className="app-container">
      {/* Шапка */}
      <header className="app-header">
        <div className="logo-section">
          <h1><TrendingUp size={28} /> PriceMonitor</h1>
          <p>Анализ цен конкурентов: «Космея» vs «Форма» (Волгодонск)</p>
        </div>
        
        <div className="header-actions">
          <div className="api-status">
            <span className={`status-dot ${apiOnline ? 'online' : 'offline'}`}></span>
            {apiOnline ? 'Бэкенд в сети' : 'Бэкенд отключен'}
          </div>
          
          <button 
            className="btn btn-primary" 
            onClick={triggerScraper} 
            disabled={isScraping || !apiOnline}
          >
            <RefreshCw size={18} className={isScraping ? 'spin-anim' : ''} />
            {isScraping ? 'Парсинг...' : 'Запустить парсер'}
          </button>
        </div>
      </header>

      {/* Карточки метрик */}
      <section className="metrics-grid">
        <div className="metric-card">
          <div className="metric-info">
            <h3>Услуг в Космее</h3>
            <p>{stats.totalCompetitor}</p>
          </div>
          <div className="metric-icon">
            <Layers size={22} />
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-info">
            <h3>Услуг в Форме</h3>
            <p>{stats.totalForma}</p>
          </div>
          <div className="metric-icon" style={{ color: 'var(--primary)', backgroundColor: 'rgba(99, 102, 241, 0.1)' }}>
            <Scissors size={22} />
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-info">
            <h3>Сопоставлено услуг</h3>
            <p>{stats.matchedCount}</p>
          </div>
          <div className="metric-icon" style={{ color: 'var(--success)', backgroundColor: 'var(--success-light)' }}>
            <CheckCircle size={22} />
          </div>
        </div>

        <div className="metric-card highlight">
          <div className="metric-info">
            <h3>Резерв повышения цен</h3>
            <p style={{ color: stats.potentialProfitCount > 0 ? '#10b981' : 'white' }}>
              {stats.potentialProfitCount} услуг
            </p>
          </div>
          <div className="metric-icon" style={{ color: '#10b981', backgroundColor: 'rgba(16, 185, 129, 0.1)' }}>
            <TrendingUp size={22} />
          </div>
        </div>
      </section>

      {/* Вкладки переключения разделов */}
      <div className="tabs-container">
        <button 
          className={`tab-btn ${activeTab === 'competitor' ? 'active' : ''}`}
          onClick={() => { setActiveTab('competitor'); setSelectedCategory('Все'); }}
        >
          <Layers size={16} />
          Космея (Конкурент)
        </button>
        <button 
          className={`tab-btn ${activeTab === 'forma' ? 'active' : ''}`}
          onClick={() => { setActiveTab('forma'); setSelectedCategory('Все'); }}
        >
          <Scissors size={16} />
          Форма (Наш салон)
        </button>
        <button 
          className={`tab-btn ${activeTab === 'comparison' ? 'active' : ''}`}
          onClick={() => setActiveTab('comparison')}
        >
          <TrendingUp size={16} />
          Сравнение цен (Аналитика)
        </button>
      </div>

      {/* Фильтры и поиск */}
      <div className="filters-bar">
        <div className="search-input-wrapper">
          <Search className="search-icon" size={18} />
          <input 
            type="text" 
            placeholder="Поиск по названию услуги..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {activeTab !== 'comparison' && (
          <select 
            className="filter-select"
            value={filterChanged}
            onChange={(e) => setFilterChanged(e.target.value)}
          >
            <option value="all">Все цены</option>
            <option value="changed">Только изменившиеся</option>
          </select>
        )}

        <button 
          className="btn btn-secondary" 
          onClick={exportToCSV}
          disabled={
            (activeTab === 'competitor' && filteredServices.length === 0) ||
            (activeTab === 'forma' && filteredFormaServices.length === 0) ||
            (activeTab === 'comparison' && filteredComparison.length === 0)
          }
        >
          <Download size={18} /> Экспорт CSV
        </button>
      </div>

      {/* Основной контент */}
      <main className="dashboard-content">
        
        {/* Боковая панель категорий (скрывается во вкладке сравнения) */}
        {activeTab !== 'comparison' && (
          <aside className="categories-sidebar">
            <h3 style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.5rem', paddingLeft: '1rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Категории
            </h3>
            {(activeTab === 'competitor' ? categories : ['Все', ...new Set(formaServices.map(s => s.category))]).map(cat => {
              const count = cat === 'Все' 
                ? (activeTab === 'competitor' ? services.length : formaServices.length)
                : (activeTab === 'competitor' 
                    ? services.filter(s => s.category === cat).length 
                    : formaServices.filter(s => s.category === cat).length);
              
              return (
                <button
                  key={cat}
                  className={`category-btn ${selectedCategory === cat ? 'active' : ''}`}
                  onClick={() => setSelectedCategory(cat)}
                >
                  <span>{cat}</span>
                  <span className="category-count">{count}</span>
                </button>
              );
            })}
          </aside>
        )}

        {/* Секция данных */}
        <section className={`data-view ${activeTab === 'comparison' ? 'full-width' : ''}`}>
          
          <div className="table-container">
            {activeTab === 'competitor' && (
              filteredServices.length > 0 ? (
                <table className="services-table">
                  <thead>
                    <tr>
                      <th>Услуга</th>
                      <th>Категория</th>
                      <th>Цена конкурента</th>
                      <th>История</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredServices.map((service) => {
                      const key = `${service.category}|||${service.title}`;
                      const hasHistory = historyData[service.title] && historyData[service.title].length > 0;
                      
                      return (
                        <tr 
                          key={key} 
                          style={{ cursor: 'pointer' }}
                          onClick={() => setSelectedService(service)}
                        >
                          <td style={{ fontWeight: '500' }}>{service.title}</td>
                          <td>
                            <span className="badge badge-info">{service.category}</span>
                          </td>
                          <td style={{ fontWeight: '600' }}>{service.price_raw}</td>
                          <td>
                            {service.price_changed ? (
                              <span className="badge badge-danger">Цена изменилась</span>
                            ) : hasHistory ? (
                              <span className="badge badge-success">Есть история</span>
                            ) : (
                              <span className="badge badge-info">Без изменений</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : (
                <div className="empty-state">
                  <AlertCircle size={48} />
                  <p>Услуги не найдены. Попробуйте изменить параметры поиска или фильтрации.</p>
                </div>
              )
            )}

            {activeTab === 'forma' && (
              filteredFormaServices.length > 0 ? (
                <table className="services-table">
                  <thead>
                    <tr>
                      <th>Услуга</th>
                      <th>Категория</th>
                      <th>Наша цена</th>
                      <th>Статус сайта</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredFormaServices.map((service) => {
                      const key = `${service.category}|||${service.title}`;
                      return (
                        <tr key={key}>
                          <td style={{ fontWeight: '500' }}>{service.title}</td>
                          <td>
                            <span className="badge badge-info">{service.category}</span>
                          </td>
                          <td style={{ fontWeight: '600' }}>{service.price_raw}</td>
                          <td>
                            <span className="badge badge-success">Опубликовано</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : (
                <div className="empty-state">
                  <AlertCircle size={48} />
                  <p>Услуги не найдены. Попробуйте изменить параметры поиска или фильтрации.</p>
                </div>
              )
            )}

            {activeTab === 'comparison' && (
              filteredComparison.length > 0 ? (
                <table className="services-table comparison-table">
                  <thead>
                    <tr>
                      <th>Услуга салона «Форма»</th>
                      <th>Наша цена</th>
                      <th>Сопоставленная услуга «Космеи»</th>
                      <th>Цена «Космеи»</th>
                      <th>Разница цен</th>
                      <th>Анализ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredComparison.map((item, index) => {
                      const diff = item.price_difference;
                      let diffClass = 'diff-neutral';
                      let diffText = 'Равные цены';
                      let statusBadge = 'badge-info';
                      let actionText = 'Цены совпадают';

                      if (diff > 0) {
                        diffClass = 'diff-positive';
                        diffText = `+${diff} ₽`;
                        statusBadge = 'badge-success';
                        actionText = 'Резерв для повышения';
                      } else if (diff < 0) {
                        diffClass = 'diff-negative';
                        diffText = `${diff} ₽`;
                        statusBadge = 'badge-danger';
                        actionText = 'У нас дороже';
                      }

                      return (
                        <tr key={index}>
                          <td>
                            <div style={{ fontWeight: '500' }}>{item.forma_title}</div>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{item.forma_category}</span>
                          </td>
                          <td style={{ fontWeight: '600' }}>{item.forma_price}</td>
                          <td>
                            <div style={{ fontWeight: '400' }}>{item.competitor_title}</div>
                            <span style={{ fontSize: '0.7rem', color: 'rgba(99, 102, 241, 0.8)' }}>Сходство: {Math.round(item.similarity * 100)}%</span>
                          </td>
                          <td style={{ fontWeight: '600' }}>{item.competitor_price}</td>
                          <td className={`comparison-diff ${diffClass}`} style={{ fontWeight: '700' }}>
                            {diffText}
                          </td>
                          <td>
                            <span className={`badge ${statusBadge}`} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                              {actionText}
                              {diff > 0 && <ArrowRight size={12} />}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : (
                <div className="empty-state">
                  <AlertCircle size={48} />
                  <p>Не найдено сопоставимых услуг. Попробуйте обновить данные парсером.</p>
                </div>
              )
            )}
          </div>
        </section>
      </main>

      {/* Модальное окно истории цен (для Космеи) */}
      {selectedService && (
        <div className="modal-overlay" onClick={() => setSelectedService(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <button className="close-modal-btn" onClick={() => setSelectedService(null)}>
              <X size={20} />
            </button>
            
            <div className="modal-header">
              <span className="modal-category">{selectedService.category}</span>
              <h2>{selectedService.title}</h2>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '0.2rem' }}>
                Текущая цена конкурента: <strong style={{ color: 'white' }}>{selectedService.price_raw}</strong>
              </p>
            </div>

            {/* График цен */}
            <div className="chart-container">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={getChartData(selectedService.title)}>
                  <defs>
                    <linearGradient id="colorPrice" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.4}/>
                      <stop offset="95%" stopColor="var(--primary)" stopOpacity={0.0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#232d45" />
                  <XAxis dataKey="date" stroke="#9ca3af" fontSize={11} />
                  <YAxis stroke="#9ca3af" fontSize={11} domain={['auto', 'auto']} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}
                    labelStyle={{ color: 'var(--text-muted)' }}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="Цена (руб)" 
                    stroke="var(--primary)" 
                    strokeWidth={2}
                    fillOpacity={1} 
                    fill="url(#colorPrice)" 
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* Сводный лог */}
            <div className="history-list">
              <h4>История записей</h4>
              <div className="history-items">
                <div className="history-item" style={{ backgroundColor: 'rgba(99, 102, 241, 0.05)' }}>
                  <span className="history-date">
                    {new Date(selectedService.last_updated).toLocaleString('ru-RU')} (Текущая)
                  </span>
                  <span className="history-price">{selectedService.price_raw}</span>
                </div>
                
                {(historyData[selectedService.title] || []).slice().reverse().map((h, i) => (
                  <div className="history-item" key={i}>
                    <span className="history-date">
                      {new Date(h.date).toLocaleString('ru-RU')}
                    </span>
                    <span className="history-price">{h.price_raw}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
