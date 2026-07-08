/* handbook.js — Наръчник: SAP транзакции + Работни процеси
   Самостоятелен файл — не засяга docs.js или друг модул
   Добавя таб "📖 Наръчник" в навигацията на ТеМАХ Портал
   ────────────────────────────────────────────────────────── */

/* ═══════════════════════════════════════════════════════════
   ДАННИ — SAP ТРАНЗАКЦИИ
═══════════════════════════════════════════════════════════ */
var HB_SAP = [
  {
    id:'mb51', code:'MB51', name:'Справка движения', cat:'Справки', tags:['минуси','951','952','953','954','контрол','движения'],
    desc:'Проверка на всички материални движения по артикул, период и вид движение.',
    steps:[
      {t:'Стартирай MB51', d:'Въведи <b>MB51</b> в командното поле → Enter'},
      {t:'Въведи завод', d:'Поле „Завод" → код на обекта (напр. <b>1024</b> за Кърджали)'},
      {t:'Избери период', d:'Дата от / до — обикновено текущия месец'},
      {t:'Вид движение (по желание)', d:'Остави празно за всички, или въведи конкретно (<b>951</b>, <b>953</b> за минуси)'},
      {t:'Изпълни (F8)', d:'Зарежда се списъкът с движенията'},
      {t:'Анализирай', d:'Търси незакрити двойки 951↔952 и 953↔954 — сумата им трябва да е нула'},
    ],
    tip:'За минусите за деня: въведи днешна дата + движения 951 и 953.',
    warn:''
  },
  {
    id:'zinvcount', code:'ZINVCOUNT', name:'Инвентаризации / стока за връщане', cat:'Инвентаризации', tags:['ревизия','опис','връщане','инвентаризация'],
    desc:'Въвеждане на описи за ревизии и стока за връщане към доставчици.',
    steps:[
      {t:'Стартирай ZINVCOUNT', d:'Въведи <b>ZINVCOUNT</b> → Enter'},
      {t:'Въведи магазин и статус', d:'Код на магазина + статус <b>Нов</b> → Изпълни'},
      {t:'Избери „Нов опис"', d:'Отваря се празен екран за въвеждане'},
      {t:'Попълни референция', d:'Задължително поле — напр. <b>Връщане към доставчик</b> (макс. 15 знака)'},
      {t:'Въведи артикулите', d:'SAP код или сканиран баркод → Enter → въведи количество → F5 за запис'},
      {t:'Финализирай', d:'F2 за завършване — системата потвърждава с номер'},
    ],
    tip:'',
    warn:'НЕ качвай стока за връщане и ревизия едновременно за осчетоводяване! Стоката за връщане — след 16ч, когато ревизиите са осчетоводени.'
  },
  {
    id:'zinvcheck', code:'ZINVCHECK', name:'Проверка преди осчетоводяване', cat:'Инвентаризации', tags:['ревизия','проверка','осчетоводяване','zinvcount'],
    desc:'Задължителна проверка на качен опис преди да изпратиш мейл за осчетоводяване.',
    steps:[
      {t:'Стартирай ZINVCHECK', d:'Въведи <b>ZINVCHECK</b> → Enter'},
      {t:'Въведи магазин', d:'Кода на обекта → Изпълни'},
      {t:'Намери описа', d:'Търси по референция или номер'},
      {t:'Провери отклоненията', d:'Артикули с отклонение 0.1 или по-малко — НЕ се качват, сигнализирай М.Павлова'},
      {t:'Коригирай ако трябва', d:'При грешно количество → редактирай или анулирай реда (зелена колона)'},
      {t:'Изпрати мейл за осчетоводяване', d:'Само след успешна проверка → до l.vasileva / n.tudjarova / a.simeonova @temax.bg'},
    ],
    tip:'',
    warn:'Отговорността за грешно качени количества остава в магазина!'
  },
  {
    id:'migo', code:'MIGO', name:'Материални движения', cat:'Движения', tags:['брак','кражба','консумативи','551','963','901','минуси'],
    desc:'Основна транзакция за всички материални движения — брак, кражби, консумативи, минуси.',
    steps:[
      {t:'Стартирай MIGO', d:'Въведи <b>MIGO</b> → Enter'},
      {t:'Избери действие и референция', d:'<b>A07</b> – изписване | <b>R10</b> – други | <b>A01</b> – получаване (за 951/953)'},
      {t:'Избери вид движение', d:'<b>551</b> брак · <b>963</b> кражба · <b>901/903/905</b> консумативи · <b>951/952/953/954</b> минуси'},
      {t:'Въведи заглавен текст', d:'„Текст ЗаглДокум" — напр. <b>Кражба м.Юни</b> или <b>ВЪТРЕШНИ НУЖДИ</b>'},
      {t:'Добави артикулите', d:'SAP код → количество → завод → склад (<b>1000</b>) → текст за позицията'},
      {t:'Провери (светофар)', d:'Бутон за проверка → зелен светофар = OK'},
      {t:'Осчетоводи', d:'Бутон „Осчетоводяване" → системата генерира документ с номер'},
    ],
    tip:'За минуси от 22:53ч — задължително смени датата на документа на предния ден!',
    warn:'За 551 (брак) — вече БЕЗ разходен център!'
  },
  {
    id:'vl06i', code:'VL06I', name:'Входящи доставки', cat:'Прием', tags:['прием','доставка','статус','стока на път'],
    desc:'Списък с всички входящи доставки за обекта — от доставчици и трансфери.',
    steps:[
      {t:'Стартирай VL06I', d:'Въведи <b>VL06I</b> → Enter'},
      {t:'Натисни „За постъпление"', d:'Зарежда само необработените доставки'},
      {t:'Натисни „Всички селекции"', d:'За да филтрираш по конкретен обект'},
      {t:'Въведи пункт за експедиция', d:'Кода на твоя магазин → остави датата празна'},
      {t:'Изпълни', d:'Статус A=необработена, B=частична, C=приключена'},
      {t:'Провери стари документи', d:'Документи статус A и B от минали дати → коригирай до статус C'},
    ],
    tip:'',
    warn:'Всички документи трябва да са статус C. Стари A/B влизат в седмична справка към снабдителите.'
  },
  {
    id:'zgrpost', code:'ZGRPOST', name:'Прием с мобилно устройство', cat:'Прием', tags:['прием','мобилно','скенер','протокол','ппп'],
    desc:'Потвърждаване на сканиран прием от мобилното устройство в SAP.',
    steps:[
      {t:'Намери номера на доставката', d:'От VL06I или стоковата разписка (започва с 180...)'},
      {t:'Сканирай на мобилното', d:'SAP Net → Скан Вход Доставка → въведи номера → сканирай с F5'},
      {t:'Стартирай ZGRPOST', d:'Въведи <b>ZGRPOST</b> на компютъра'},
      {t:'Въведи номера на доставката', d:'→ Изпълни → зарежда се цялото сканирано'},
      {t:'Провери', d:'Сравни сканираните количества с документа на доставчика'},
      {t:'POST', d:'Бутон POST → генерира протокол (ППП) с номер (5000...)'},
      {t:'Отпечатай протокола', d:'MB90 → въведи номера → Процес → Отпечатване сега → Печат'},
    ],
    tip:'Можеш да отвориш произволен стар протокол в MIGO/показване предварително — избягваш грешката с прозорец при ZGRPOST.',
    warn:''
  },
  {
    id:'zgipost', code:'ZGIPOST', name:'Потвърждаване на изписване', cat:'Изписване', tags:['изписване','трансфер','издаване'],
    desc:'Финално потвърждение на сканирано изписване.',
    steps:[
      {t:'Стартирай ZGIPOST', d:'Въведи <b>ZGIPOST</b> → Enter'},
      {t:'Въведи номера на изходящата доставка', d:'→ Изпълни'},
      {t:'Провери данните', d:'Сканирани количества vs. документ — можеш да коригираш в „Целево Количество"'},
      {t:'POST', d:'Бутон POST → стоките се изписват'},
    ],
    tip:'',
    warn:'Не се позволява частично изписване! При по-малко сканирани — системата коригира автоматично.'
  },
  {
    id:'vl06o', code:'VL06O', name:'Изходящи доставки', cat:'Изписване', tags:['изписване','трансфер','издаване','vl06o'],
    desc:'Списък с изходящи доставки — трансфери и връщания към доставчици.',
    steps:[
      {t:'Стартирай VL06O', d:'Въведи <b>VL06O</b> → Enter'},
      {t:'Избери вид списък', d:'„Списък изходящи" за всички | „За отпускане" само за чакащите'},
      {t:'Въведи пункт за експедиция', d:'Кода на обекта → остави датата празна'},
      {t:'Изпълни', d:'Виждаш номерата и получателите'},
    ],
    tip:'', warn:''
  },
  {
    id:'zstr', code:'ZSTR', name:'Заявка за трансфер', cat:'Трансфери', tags:['трансфер','заявка','изпращане','клиентска'],
    desc:'Генериране на заявка за трансфер на стока между обекти.',
    steps:[
      {t:'Стартирай ZSTR', d:'Въведи <b>ZSTR</b> → Enter'},
      {t:'Избери изпращащ и получаващ обект', d:''},
      {t:'Въведи тип заявка', d:'<b>1</b> = клиентска заявка | <b>4</b> = корекция трансфер (за разлики!)'},
      {t:'Попълни артикулите и количествата', d:''},
      {t:'Генерирай', d:'Системата създава заявката — изпращачът я вижда в ZSTO'},
    ],
    tip:'',
    warn:'Всички заявки по разлики при трансфери задължително с тип 4 — корекция трансфер!'
  },
  {
    id:'zsto', code:'ZSTO', name:'Обработка на заявки за трансфер', cat:'Трансфери', tags:['трансфер','обработка','изпращане','складова разписка'],
    desc:'Обработка на постъпили заявки от други обекти — от изпращащия обект.',
    steps:[
      {t:'Стартирай ZSTO', d:'Въведи <b>ZSTO</b> → Enter — виждат се необработените заявки'},
      {t:'Селектирай редовете', d:'Избери поне един ред от заявката'},
      {t:'Натисни Process', d:'Системата генерира Складова разписка + изходяща доставка'},
      {t:'Събери стоката', d:'По Складовата разписка физически'},
      {t:'Изпиши с мобилното', d:'Стоките с баркод ЗАДЪЛЖИТЕЛНО с мобилното устройство'},
    ],
    tip:'Стоката на палет/кашон — придружи с документ: „От ТеМАХ [от] за ТеМАХ [до]" + номер на СР',
    warn:''
  },
  {
    id:'zdeliv', code:'ZDELIV', name:'Намиране на ВД по стокова разписка', cat:'Прием', tags:['трансфер','входяща доставка','стокова разписка'],
    desc:'При трансфер — намиране на входящата доставка по номера на стоковата разписка.',
    steps:[
      {t:'Стартирай ZDELIV', d:'Въведи <b>ZDELIV</b> → Enter'},
      {t:'Въведи получател', d:'На множествен избор — въведи и двата склада на обекта'},
      {t:'Изпълни', d:'Зарежда се списък с доставките'},
      {t:'Намери по номер', d:'Номерът от стоковата разписка = номер на Изходящата доставка → виждаш Входящата'},
    ],
    tip:'', warn:''
  },
  {
    id:'kl-poruchki', code:'MIGO 951/952', name:'Клиентски поръчки', cat:'Клиентски', tags:['клиент','поръчка','951','952','zstock'],
    desc:'Два варианта: неналичен артикул (заприхождаваш с 951, изписваш с 952) или наличен с капаро.',
    steps:[
      {t:'Осчетоводи заприхождаването', d:'MIGO → A01 → R10 → движение <b>951</b> → артикул → текст: номер и дата на поръчката'},
      {t:'Генерирай заявка', d:'<b>ZSTOCK</b> за заявка към доставчик | <b>ZSTR тип 1</b> за трансфер от магазин'},
      {t:'При доставка — изпиши', d:'MIGO → A07 → R10 → движение <b>952</b> → същия артикул → текст: номер и дата'},
      {t:'Провери в MB51', d:'Движения 951+952 → количествата трябва да са равни, сума = 0'},
    ],
    tip:'',
    warn:'Артикули с 951 НЕ се ревизират! 951 от 22:53 → смени датата!'
  },
  {
    id:'zmb52', code:'ZMB52', name:'Наличности по артикул', cat:'Справки', tags:['наличност','справка','артикул','ревизия'],
    desc:'Бърза проверка на наличност в SAP — използва се при случайна ревизия при посещение.',
    steps:[
      {t:'Стартирай ZMB52 или ZMATERIALS', d:'Въведи кода → Enter'},
      {t:'Въведи група или артикул', d:'Виждаш всички артикули включително без наличност'},
      {t:'Сравни с физическото', d:'Преброй на място → сравни с SAP → разлика → запиши в контролната карта'},
      {t:'При разлика', d:'Питаш управителя → ако системна грешка → ZINVCOUNT за корекция'},
    ],
    tip:'Идеален за изненадваща проверка при посещение.', warn:''
  },
  {
    id:'mb90', code:'MB90', name:'Отпечатване на протоколи (ППП)', cat:'Прием', tags:['протокол','печат','ппп','прием'],
    desc:'Отпечатване на приемо-предавателен протокол след осчетоводен прием.',
    steps:[
      {t:'Стартирай MB90', d:'Въведи <b>MB90</b> → Enter'},
      {t:'Въведи номера на документа', d:'Номерът от ZGRPOST (5000...) → Изпълни'},
      {t:'Маркирай реда', d:'Избери реда с документа'},
      {t:'Процес → Отпечатване сега → Печат', d:''},
    ],
    tip:'', warn:''
  },
  {
    id:'vl02n', code:'VL02N', name:'Ръчно изписване (плочки/ламинат)', cat:'Изписване', tags:['изписване','плочки','ламинат','ръчно'],
    desc:'Ръчно потвърждаване на изходяща доставка — само за стоки без баркод.',
    steps:[
      {t:'Стартирай VL02N', d:'Въведи <b>VL02N</b> → Enter'},
      {t:'Въведи номера на СР', d:'→ Продължаване'},
      {t:'Осчет.Изписв.Стоки', d:'Бутон → потвърди изписването'},
      {t:'Разпечатай Стоковата разписка', d:''},
    ],
    tip:'', warn:''
  },
];

/* ═══════════════════════════════════════════════════════════
   ДАННИ — РАБОТНИ ПРОЦЕСИ
═══════════════════════════════════════════════════════════ */
var HB_PROC = [
  {
    id:'proc-priem', code:'ПРИЕМ', name:'Прием на стока', cat:'Операции', tags:['прием','доставка','vl06i','zgrpost','ппп','мобилно'],
    desc:'Приемане на стока от доставчик или трансфер. Задължително с мобилно устройство (изключение: плочки, ламинат, балатум).',
    steps:[
      {t:'Провери документа', d:'Без стокова разписка — НЕ приемай. Провери броя пакети по товарителница преди разтоварване'},
      {t:'Прегледай стоката', d:'Провери за увреждания, разлики, грешни баркоди. При проблем — снимай веднага'},
      {t:'Намери ВД', d:'<b>VL06I</b> → За постъпление → Всички селекции → въведи обекта. За трансфери: <b>ZDELIV</b>'},
      {t:'Сканирай с мобилното', d:'SAP Netweaver → Скан Вход Доставка → въведи номер → сканирай баркод → F5 → F2 за завършване'},
      {t:'Осчетоводи в ZGRPOST', d:'Въведи номера на ВД → Изпълни → провери → POST → запиши номера (5000...)'},
      {t:'Отпечатай ППП', d:'<b>MB90</b> → номера → Изпълни → Процес → Отпечатване сега → Печат'},
      {t:'Провери статус', d:'<b>VL06I</b> → ВД трябва да е статус C. A или B = незатворена = проблем'},
    ],
    warn:'Приетата стока влиза в зала САМО с етикети и ППП. Без одобрение от ЦО — не пускай в зала.'
  },
  {
    id:'proc-minusi', code:'МИНУСИ', name:'Минуси от продажби', cat:'Операции', tags:['минуси','953','951','migo','22:53','справка'],
    desc:'Ежедневно в 13:53, 15:53 и 22:53 системата генерира минуси. Осчетоводяват се до 8:30 на следващия ден.',
    steps:[
      {t:'Провери минусите', d:'Вземи справката → провери кой артикул е реално даден → попълни жълтите колони'},
      {t:'Осчетоводи с 953', d:'<b>MIGO</b> → A01 → R10 → движение <b>953</b> → артикул → завод → склад 1000 → Осчетоводи'},
      {t:'Смени датата за 22:53!', d:'За минуси от 22:53 — ЗАДЪЛЖИТЕЛНО смени датата на ПРЕДНИЯ ден'},
      {t:'Изпрати справката', d:'MB51 → завод → движение 951+953 → дата вчера → Изпълни → Excel → попълни → изпрати до minus@temax.bg'},
      {t:'Провери обратни движения', d:'<b>MB51</b> → движения 951+952 → всяка двойка трябва да е с равни количества, сума = 0'},
    ],
    warn:'Смяна на датата за минусите от 22:53 е ЗАДЪЛЖИТЕЛНА. Незакрити двойки 951/952 = скрити финансови разлики.'
  },
  {
    id:'proc-revizii', code:'РЕВИЗИИ', name:'Инвентаризации / ревизии', cat:'Операции', tags:['ревизия','инвентаризация','zinvcount','zinvcheck','мобилно'],
    desc:'Ревизии задължително с мобилно. Изключение: плочки, ламинат, мокет, балатум — директно в ZINVCOUNT или Excel.',
    steps:[
      {t:'Извади списък', d:'ZMB52 или ZMATERIALS — включително без наличност. Отпечатай за броене'},
      {t:'Сканирай с мобилното', d:'SAP Netweaver → Скан инвентаризация → Нов опис → Реф (макс 15 символа) → сканирай → F5 → F2'},
      {t:'Корекция на опис', d:'Скан инвентаризация → Корекция → въведи НОМЕРА (не референцията!) → коригирай → F5 → F2'},
      {t:'Провери в ZINVCHECK', d:'Малки отклонения (0.05, 0.1) → НЕ осчетоводявай → сигнализирай М.Павлова'},
      {t:'Изпрати мейл', d:'Само след успешна проверка → до l.vasileva / n.tudjarova / a.simeonova @temax.bg'},
    ],
    warn:'Корекции след изпратен мейл за осчетоводяване са ЗАБРАНЕНИ. Прием в ревизирана група е забранен до потвърждение.'
  },
  {
    id:'proc-izpisvane', code:'ИЗПИСВАНЕ', name:'Изписване / трансфери', cat:'Операции', tags:['изписване','трансфер','zsto','zgipost','складова разписка'],
    desc:'Изписване при трансфер към друг обект или връщане. Стоки с баркод ЗАДЪЛЖИТЕЛНО с мобилно.',
    steps:[
      {t:'Обработи заявката', d:'<b>ZSTO</b> → селектирай ред → Process → системата генерира Складова разписка'},
      {t:'Събери стоката', d:'По Складовата разписка физически. Придружи палет/кашон с документ и номер на СР'},
      {t:'Сканирай с мобилното', d:'SAP Netweaver → Скан Изход Доставка → въведи номер → сканирай → F5 → F7'},
      {t:'Осчетоводи в ZGIPOST', d:'Въведи номера на изх.доставка → Изпълни → провери → POST'},
    ],
    warn:'Не се позволява частично изписване!'
  },
  {
    id:'proc-brak', code:'ДВИЖЕНИЯ', name:'Брак, кражби, консумативи', cat:'Операции', tags:['брак','551','кражба','963','консумативи','901','migo'],
    desc:'Всички материални движения се осчетоводяват в MIGO. Проверявай кое движение е заредено преди въвеждане.',
    steps:[
      {t:'Консумативи (901/903/905)', d:'MIGO → A07 → R10 → движение 901/903/905 → Текст „ВЪТРЕШНИ НУЖДИ" → разходен център = код на завода'},
      {t:'Кражби (963)', d:'MIGO → A07 → R10 → движение 963 → Текст „Кражба м.Юни" → Текст позиция: „празна опаковка" → снимки в папка'},
      {t:'Брак (551)', d:'MIGO → A07 → R10 → движение 551 → текст: причина → Причина за движение (1-4) → БЕЗ разходен център!'},
    ],
    warn:'За 551 (брак) — вече БЕЗ разходен център! Пишете подробни бележки — „счупено" не е достатъчно.'
  },
  {
    id:'proc-vrushtane', code:'ВРЪЩАНЕ', name:'Връщане на стока към доставчик', cat:'Операции', tags:['връщане','доставчик','zinvcount','рекламация','onedrive'],
    desc:'Всяка сряда — качване в ZINVCOUNT. Физическо изпращане от 1-во до 10-то число (осветление).',
    steps:[
      {t:'Събери стоката', d:'По вид: рекламации, сезонна, изтекъл срок, замяна номенклатура'},
      {t:'Качи в ZINVCOUNT', d:'Референция: „Връщане към доставчик" → артикули → коментар (причина) → Запис'},
      {t:'Провери в ZINVCHECK', d:'Само след OK изпрати мейл за осчетоводяване'},
      {t:'Актуализирай OneDrive', d:'„Обобщен списък — стока за връщане" → актуализирай взето/невзето'},
    ],
    warn:'Стоката за връщане и ревизиите НЕ се качват едновременно! Рекламации осветление — до 10-то число.'
  },
  {
    id:'proc-razliki-dos', code:'РАЗЛИКИ-ДОСТАВЧИК', name:'Разлики при прием от доставчик', cat:'Разлики', tags:['разлика','доставчик','priem','мейл','снимки'],
    desc:'При разлика между документа и физически доставеното — подай в ДЕНЯ на доставката. Срок: максимум 3 дни.',
    steps:[
      {t:'Снимай веднага', d:'Увредена стока, липси, грешен баркод/етикет'},
      {t:'Попълни бланката', d:'SAP код, по ВД, по стокова на доставчика, реално доставено'},
      {t:'Изпрати мейл в деня', d:'НОВ имейл за всяка поръчка отделно → Тема: [Номер поръчка] - РАЗЛИКИ → c.teneva@temax.bg + снабдител + счетоводител'},
      {t:'След обработка от ЦО', d:'Излишък → върни с ИД. Липса → изпиши с ИД. Грешен прием → незабавен мейл до c.teneva + m.pavlova'},
    ],
    warn:'НЕ приемай, лепи етикети или пускай в зала стока без одобрение от ЦО.'
  },
  {
    id:'proc-razliki-transf', code:'РАЗЛИКИ-ТРАНСФЕР', name:'Разлики при трансфер между обекти', cat:'Разлики', tags:['разлика','трансфер','zstr','тип 4','бланка'],
    desc:'При разлика при получен трансфер — подай бланка до обекта изпращач до 3 дни. Заявките за корекция с тип 4.',
    steps:[
      {t:'Снимай', d:'Разлика от фабрична опаковка, увредена стока, грешен баркод'},
      {t:'Изпрати бланка', d:'Мейл до обекта изпращач с попълнена бланка до 3 дни след доставката'},
      {t:'Излишък без документ', d:'Провери за А/В в VL06I → ако няма: ZSTR тип 4 (корекция трансфер!)'},
      {t:'Грешен баркод', d:'Мейл до j.jeliazkov@temax.bg и m.pavlova@temax.bg + снимки'},
    ],
    warn:'ВСИЧКИ заявки по разлики при трансфери — тип 4! Не тип 1.'
  },
  {
    id:'proc-kl-poruchki', code:'КЛ.ПОРЪЧКИ', name:'Клиентски поръчки', cat:'Клиентски', tags:['клиент','поръчка','951','952','zstock'],
    desc:'Неналичен артикул — заприхождаваш с 951, изписваш с 952 при доставка.',
    steps:[
      {t:'Попълни бланката', d:'По образец. Маркирай на каса: неналичен → арт.94549 | с капаро → арт.900001'},
      {t:'Осчетоводи 951', d:'MIGO → A01 → R10 → движение 951 → текст: номер и дата на поръчката'},
      {t:'Генерирай заявка', d:'ZSTOCK за доставчик | ZSTR тип 1 за трансфер'},
      {t:'При доставка — 952', d:'MIGO → A07 → R10 → движение 952 → текст: номер и дата → Осчетоводи'},
      {t:'Провери в MB51', d:'951+952 → количества равни, сума = 0'},
    ],
    warn:'Артикули с 951 НЕ се ревизират! Незакрити 951 от предни месеци = спешна проверка.'
  },
  {
    id:'proc-instruktagji', code:'ИНСТРУКТАЖИ', name:'Инструктажни книги', cat:'Охрана на труда', tags:['инструктаж','книга','охрана','труд','ит'],
    desc:'Управителят води инструктажните книги. При проверка от ИТ — задължителен документ.',
    steps:[
      {t:'Две отделни книги', d:'1) Начален инструктаж · 2) Периодичен/извънреден и на работното място'},
      {t:'Начален инструктаж', d:'При постъпване — веднъж. Данни: пореден №, три имена, обект, длъжност, дата, подписи'},
      {t:'Служебна бележка', d:'Задължително след началния — датата = дата на постъпване, № = пореден № от книгата'},
      {t:'Периодичен инструктаж', d:'Веднъж годишно. При отсъствие — вписва се на първия работен ден след него'},
    ],
    warn:'Непопълнена книга при проверка от ИТ = нарушение!'
  },
  {
    id:'proc-grafik', code:'ГРАФИЦИ', name:'Месечни графици и ТРЗ', cat:'Месечни', tags:['график','трз','присъствена','месец'],
    desc:'Контролираш дали управителят е изпратил навреме. При пропуск — ескалираш.',
    steps:[
      {t:'До 25-то число', d:'Нов работен график за следващия месец — изпратен ли е?'},
      {t:'До края на месеца', d:'График до ТРЗ за одобрение — различен документ от работния'},
      {t:'До 3-то число', d:'Присъствена форма до ТРЗ за изработените часове'},
    ],
    warn:'Закъснение с присъствената форма блокира изплащането на заплатите!'
  },
  {
    id:'proc-motokar', code:'БЗР-МОТОКАР', name:'Безопасна работа с мотокар', cat:'Охрана на труда', tags:['мотокар','безопасност','документ','правоуправление'],
    desc:'Само лица с документ за правоуправление се допускат до работа с мотокар.',
    steps:[
      {t:'Проверявай документите', d:'При всяко посещение: документи за правоуправление + заповеди за допускане'},
      {t:'При нередности', d:'Без документ → незабавно спиране от работа → уведоми управителя писмено'},
      {t:'Правила', d:'Товарът движи спуснат. Забранено: качване на хора на вилите. При наклон: товарът нагоре'},
    ],
    warn:'Работа с мотокар без документ = административно нарушение.'
  },
  {
    id:'proc-dosie', code:'ДОСИЕ', name:'Досие при назначаване', cat:'Месечни', tags:['досие','назначаване','трудов','документи'],
    desc:'Чеклист за документи при назначаване на нов служител.',
    steps:[
      {t:'Преди назначаване', d:'Заявление · Копие лична карта · Диплома · Трудова книжка · Декларация чл.348 · Служебни бележки · Банкова сметка · Медицинско · Свидетелство за съдимост'},
      {t:'След назначаване', d:'Служебна бележка за начален инструктаж · Справка от НАП за регистриране на трудовия договор'},
    ],
    warn:'Непълно досие при проверка от ИТ = нарушение! Провери до 3 дни от назначаването.'
  },
];

/* ═══════════════════════════════════════════════════════════
   КАТЕГОРИИ И ЦВЕТОВЕ
═══════════════════════════════════════════════════════════ */
var HB_CAT_COLORS = {
  'Справки':       {bg:'#eff6ff', border:'#2563eb', text:'#1e40af', icon:'🔍'},
  'Инвентаризации':{bg:'#f0fdf4', border:'#16a34a', text:'#14532d', icon:'📋'},
  'Движения':      {bg:'#fefce8', border:'#ca8a04', text:'#713f12', icon:'📦'},
  'Прием':         {bg:'#eff6ff', border:'#2563eb', text:'#1e40af', icon:'⬇️'},
  'Изписване':     {bg:'#f0fdf4', border:'#16a34a', text:'#14532d', icon:'⬆️'},
  'Трансфери':     {bg:'#f5f3ff', border:'#7c3aed', text:'#4c1d95', icon:'🔄'},
  'Клиентски':     {bg:'#fff7ed', border:'#ea580c', text:'#7c2d12', icon:'👤'},
  'Операции':      {bg:'#fff1f2', border:'#e11d48', text:'#881337', icon:'⚙️'},
  'Разлики':       {bg:'#fff7ed', border:'#ea580c', text:'#7c2d12', icon:'⚠️'},
  'Охрана на труда':{bg:'#fef2f2', border:'#dc2626', text:'#7f1d1d', icon:'🦺'},
  'Месечни':       {bg:'#fdf4ff', border:'#a21caf', text:'#701a75', icon:'📅'},
};

/* ═══════════════════════════════════════════════════════════
   ИНИЦИАЛИЗАЦИЯ — добавя таба и div-а динамично
═══════════════════════════════════════════════════════════ */
(function initHandbook() {
  /* 1. Добави стиловете */
  var style = document.createElement('style');
  style.textContent = [
    '#tab-handbook{border-top:3px solid transparent;}',
    '#tab-handbook:hover{color:#a5f3fc;background:rgba(8,145,178,.25);}',
    '#tab-handbook.active{color:#22d3ee;border-bottom-color:#0891b2;border-top-color:#0891b2;background:rgba(8,145,178,.2);}',
    '.hb-search-wrap{position:relative;margin-bottom:20px;}',
    '.hb-search{width:100%;padding:12px 16px 12px 44px;font-size:15px;font-family:inherit;border:2px solid var(--border);border-radius:10px;background:#fff;color:var(--text);transition:border-color .2s;}',
    '.hb-search:focus{outline:none;border-color:#0891b2;}',
    '.hb-search-icon{position:absolute;left:14px;top:50%;transform:translateY(-50%);font-size:18px;pointer-events:none;}',
    '.hb-search-clear{position:absolute;right:12px;top:50%;transform:translateY(-50%);background:none;border:none;font-size:18px;cursor:pointer;color:var(--muted);display:none;padding:2px 6px;border-radius:4px;}',
    '.hb-search-clear:hover{color:var(--text);}',
    '.hb-cats{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:20px;}',
    '.hb-cat-btn{border:1.5px solid var(--border);background:#fff;border-radius:20px;padding:5px 14px;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;color:var(--muted);transition:all .15s;white-space:nowrap;}',
    '.hb-cat-btn:hover{border-color:#0891b2;color:#0891b2;}',
    '.hb-cat-btn.active{background:#0891b2;color:#fff;border-color:#0891b2;}',
    '.hb-type-toggle{display:flex;gap:4px;background:#f1f5f9;padding:3px;border-radius:8px;margin-bottom:20px;width:fit-content;}',
    '.hb-type-btn{padding:5px 16px;border:none;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;color:var(--muted);background:transparent;transition:all .15s;}',
    '.hb-type-btn.active{background:#fff;color:var(--text);box-shadow:0 1px 3px rgba(0,0,0,.12);}',
    '.hb-results-info{font-size:12px;color:var(--muted);margin-bottom:12px;}',
    '.hb-card{background:#fff;border:1px solid var(--border);border-radius:10px;margin-bottom:10px;overflow:hidden;transition:box-shadow .15s;}',
    '.hb-card:hover{box-shadow:0 2px 12px rgba(0,0,0,.08);}',
    '.hb-card-hd{display:flex;align-items:center;gap:12px;padding:13px 16px;cursor:pointer;user-select:none;}',
    '.hb-card-icon{font-size:18px;flex-shrink:0;width:32px;text-align:center;}',
    '.hb-card-code{font-family:"DM Mono",monospace;font-size:12px;font-weight:600;padding:2px 8px;border-radius:5px;flex-shrink:0;}',
    '.hb-card-name{font-size:13px;font-weight:600;flex:1;}',
    '.hb-card-cat{font-size:11px;font-weight:500;padding:2px 8px;border-radius:10px;flex-shrink:0;}',
    '.hb-card-arr{font-size:12px;color:var(--muted);transition:transform .2s;flex-shrink:0;}',
    '.hb-card.open .hb-card-arr{transform:rotate(90deg);}',
    '.hb-card-body{display:none;border-top:1px solid var(--border);padding:16px;}',
    '.hb-card.open .hb-card-body{display:block;}',
    '.hb-desc{font-size:13px;color:var(--muted);margin-bottom:14px;line-height:1.5;}',
    '.hb-steps{counter-reset:step;}',
    '.hb-step{display:flex;gap:10px;margin-bottom:10px;align-items:flex-start;}',
    '.hb-step-n{width:22px;height:22px;border-radius:50%;background:#0891b2;color:#fff;font-size:10px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:1px;}',
    '.hb-step-body{flex:1;font-size:13px;line-height:1.5;}',
    '.hb-step-body strong{display:block;font-weight:600;margin-bottom:1px;}',
    '.hb-step-body b{background:#f1f5f9;padding:1px 5px;border-radius:3px;font-family:"DM Mono",monospace;font-size:12px;}',
    '.hb-warn{background:#fff5f5;border:1px solid #fca5a5;border-radius:7px;padding:9px 12px;font-size:12px;color:#b91c1c;margin-top:10px;line-height:1.5;}',
    '.hb-tip{background:#f0fdf4;border:1px solid #86efac;border-radius:7px;padding:9px 12px;font-size:12px;color:#15803d;margin-top:8px;line-height:1.5;}',
    '.hb-empty{text-align:center;padding:60px 20px;color:var(--muted);}',
    '.hb-empty .hb-empty-icon{font-size:42px;margin-bottom:10px;}',
    'mark.hb-hl{background:#fef08a;padding:0 1px;border-radius:2px;}',
  ].join('');
  document.head.appendChild(style);

  /* 2. Добави таб в навигацията — преди tab-docs */
  var tabDocs = document.getElementById('tab-docs');
  var container = document.getElementById('nav-tabs-container');
  if (tabDocs && container) {
    var btn = document.createElement('button');
    btn.id = 'tab-handbook';
    btn.className = 'nav-tab';
    btn.setAttribute('onclick', "showModule('handbook')");
    btn.innerHTML = '<span class="ti">📖</span><span class="tl">Наръчник</span>';
    container.insertBefore(btn, tabDocs);
  }

  /* 3. Добави div за модула */
  var app = document.getElementById('s-app');
  if (app) {
    var div = document.createElement('div');
    div.id = 'mod-handbook';
    div.style.display = 'none';
    app.appendChild(div);
  }
})();

/* ═══════════════════════════════════════════════════════════
   РЕНДИРАНЕ
═══════════════════════════════════════════════════════════ */
var hbState = {
  search: '',
  type: 'all',   /* 'all' | 'sap' | 'proc' */
  cat: 'all',
  openCards: {}
};

function renderHandbook() {
  var wrap = document.getElementById('mod-handbook');
  if (!wrap) return;

  /* Вземи всички категории */
  var allCats = {};
  HB_SAP.concat(HB_PROC).forEach(function(item) { allCats[item.cat] = true; });
  var catList = Object.keys(allCats).sort();

  /* Филтрирай данните */
  var items = filterHandbook();

  /* Категориите за текущия тип */
  var visibleCats = {};
  items.forEach(function(item) { visibleCats[item.cat] = true; });

  /* HTML */
  var html = '<div class="page">'
    + '<div class="pg-title">📖 Наръчник</div>'
    + '<div class="pg-sub">SAP транзакции и работни процеси — бърза справка.</div>'

    /* Search */
    + '<div class="hb-search-wrap">'
    + '<span class="hb-search-icon">🔍</span>'
    + '<input class="hb-search" id="hb-search-input" type="text" placeholder="Търси — напр. минуси, прием, ZINVCOUNT, 951..." value="' + esc(hbState.search) + '" oninput="hbOnSearch(this.value)">'
    + '<button class="hb-search-clear" id="hb-search-clear" onclick="hbClearSearch()" title="Изчисти">✕</button>'
    + '</div>'

    /* Тип */
    + '<div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap;margin-bottom:16px;">'
    + '<div class="hb-type-toggle">'
    + '<button class="hb-type-btn' + (hbState.type==='all'?' active':'') + '" onclick="hbSetType(\'all\')">Всичко</button>'
    + '<button class="hb-type-btn' + (hbState.type==='sap'?' active':'') + '" onclick="hbSetType(\'sap\')">⌨ SAP</button>'
    + '<button class="hb-type-btn' + (hbState.type==='proc'?' active':'') + '" onclick="hbSetType(\'proc\')">⚙ Процеси</button>'
    + '</div>'
    + '</div>'

    /* Категории */
    + '<div class="hb-cats">'
    + '<button class="hb-cat-btn' + (hbState.cat==='all'?' active':'') + '" onclick="hbSetCat(\'all\')">Всички</button>';

  catList.forEach(function(cat) {
    if (!visibleCats[cat]) return;
    var cc = HB_CAT_COLORS[cat] || {};
    html += '<button class="hb-cat-btn' + (hbState.cat===cat?' active':'') + '" onclick="hbSetCat(\'' + cat + '\')" style="' + (hbState.cat===cat?'background:'+cc.border+';color:#fff;border-color:'+cc.border:'') + '">'
      + (cc.icon ? cc.icon + ' ' : '') + cat
      + '</button>';
  });
  html += '</div>';

  /* Брой резултати */
  html += '<div class="hb-results-info">'
    + (hbState.search ? 'Намерени: <b>' + items.length + '</b> записа за „' + esc(hbState.search) + '"' : '<b>' + items.length + '</b> записа')
    + '</div>';

  /* Карти */
  if (!items.length) {
    html += '<div class="hb-empty"><div class="hb-empty-icon">🔍</div><div>Няма намерени резултати за „' + esc(hbState.search) + '"</div></div>';
  } else {
    /* Групирай по категория */
    var groups = {};
    items.forEach(function(item) {
      if (!groups[item.cat]) groups[item.cat] = [];
      groups[item.cat].push(item);
    });

    Object.keys(groups).forEach(function(cat) {
      var cc = HB_CAT_COLORS[cat] || {icon:'📄', border:'#e2e8f0', bg:'#f8fafc', text:'#64748b'};
      html += '<div style="font-size:11px;font-weight:700;color:' + cc.text + ';text-transform:uppercase;letter-spacing:.06em;margin:16px 0 8px;display:flex;align-items:center;gap:6px;">'
        + '<span>' + cc.icon + '</span><span>' + cat + '</span>'
        + '<div style="flex:1;height:1px;background:' + cc.border + ';opacity:.4;margin-left:4px;"></div>'
        + '</div>';

      groups[cat].forEach(function(item) {
        html += renderHbCard(item, cc);
      });
    });
  }

  html += '</div>';
  wrap.innerHTML = html;

  /* Покажи/скрий clear бутон */
  var clearBtn = document.getElementById('hb-search-clear');
  if (clearBtn) clearBtn.style.display = hbState.search ? 'block' : 'none';
}

function renderHbCard(item, cc) {
  var isOpen = !!hbState.openCards[item.id];
  var isSap = item.id.indexOf('proc-') === -1;
  var typeLabel = isSap ? 'SAP' : 'Процес';
  var typeBg = isSap ? '#eff6ff' : '#f0fdf4';
  var typeColor = isSap ? '#1e40af' : '#14532d';

  var html = '<div class="hb-card' + (isOpen?' open':'') + '" id="hbc-' + item.id + '">'
    + '<div class="hb-card-hd" onclick="hbToggleCard(\'' + item.id + '\')">'
    + '<div class="hb-card-icon">' + (cc.icon || '📄') + '</div>'
    + '<div class="hb-card-code" style="background:' + cc.bg + ';color:' + cc.text + ';border:1px solid ' + cc.border + ';">' + hlSearch(item.code) + '</div>'
    + '<div class="hb-card-name">' + hlSearch(item.name) + '</div>'
    + '<div class="hb-card-cat" style="background:' + typeBg + ';color:' + typeColor + ';">' + typeLabel + '</div>'
    + '<div class="hb-card-arr">▶</div>'
    + '</div>';

  if (isOpen) {
    html += '<div class="hb-card-body">'
      + '<div class="hb-desc">' + hlSearch(item.desc) + '</div>'
      + '<div class="hb-steps">';

    item.steps.forEach(function(step, i) {
      html += '<div class="hb-step">'
        + '<div class="hb-step-n">' + (i+1) + '</div>'
        + '<div class="hb-step-body"><strong>' + hlSearch(step.t) + '</strong>'
        + (step.d ? '<span>' + hlSearch(step.d) + '</span>' : '')
        + '</div></div>';
    });

    html += '</div>';

    if (item.warn) {
      html += '<div class="hb-warn">⚠ ' + hlSearch(item.warn) + '</div>';
    }
    if (item.tip) {
      html += '<div class="hb-tip">💡 ' + hlSearch(item.tip) + '</div>';
    }
    html += '</div>';
  }

  html += '</div>';
  return html;
}

/* ═══════════════════════════════════════════════════════════
   ФИЛТРИРАНЕ
═══════════════════════════════════════════════════════════ */
function filterHandbook() {
  var q = hbState.search.toLowerCase().trim();

  /* Избери тип */
  var pool = [];
  if (hbState.type === 'sap')  pool = HB_SAP.slice();
  else if (hbState.type === 'proc') pool = HB_PROC.slice();
  else pool = HB_SAP.concat(HB_PROC);

  /* Филтрирай по категория */
  if (hbState.cat !== 'all') {
    pool = pool.filter(function(item) { return item.cat === hbState.cat; });
  }

  /* Филтрирай по search */
  if (!q) return pool;

  return pool.filter(function(item) {
    var haystack = [
      item.code, item.name, item.cat, item.desc,
      (item.tags || []).join(' ')
    ].join(' ').toLowerCase();

    /* И стъпките */
    item.steps.forEach(function(s) {
      haystack += ' ' + (s.t + ' ' + s.d).toLowerCase();
    });

    return q.split(' ').every(function(word) { return haystack.indexOf(word) !== -1; });
  });
}

/* ═══════════════════════════════════════════════════════════
   HIGHLIGHT на search термина
═══════════════════════════════════════════════════════════ */
function hlSearch(text) {
  if (!text) return '';
  if (!hbState.search) return text;
  var q = hbState.search.trim();
  if (!q) return text;
  try {
    var escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return text.replace(new RegExp('(' + escaped + ')', 'gi'), '<mark class="hb-hl">$1</mark>');
  } catch(e) { return text; }
}

/* ═══════════════════════════════════════════════════════════
   ЕВЕНТИ
═══════════════════════════════════════════════════════════ */
function hbOnSearch(val) {
  hbState.search = val;
  hbState.openCards = {};
  /* При search — отвори първия резултат автоматично */
  if (val.trim()) {
    var results = filterHandbook();
    if (results.length === 1) {
      hbState.openCards[results[0].id] = true;
    }
  }
  renderHandbook();
  /* Върни фокуса на search полето */
  var inp = document.getElementById('hb-search-input');
  if (inp) { inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); }
}

function hbClearSearch() {
  hbState.search = '';
  hbState.openCards = {};
  renderHandbook();
  var inp = document.getElementById('hb-search-input');
  if (inp) inp.focus();
}

function hbSetType(type) {
  hbState.type = type;
  hbState.cat = 'all';
  hbState.openCards = {};
  renderHandbook();
}

function hbSetCat(cat) {
  hbState.cat = cat;
  hbState.openCards = {};
  renderHandbook();
}

function hbToggleCard(id) {
  hbState.openCards[id] = !hbState.openCards[id];
  var card = document.getElementById('hbc-' + id);
  if (!card) return;
  card.classList.toggle('open', !!hbState.openCards[id]);
  var body = card.querySelector('.hb-card-body');
  var arr = card.querySelector('.hb-card-arr');

  if (hbState.openCards[id] && !body) {
    /* Рендирай body динамично */
    var allItems = HB_SAP.concat(HB_PROC);
    var item = allItems.filter(function(x){ return x.id === id; })[0];
    if (!item) return;
    var cc = HB_CAT_COLORS[item.cat] || {};
    /* Добави body */
    card.innerHTML = renderHbCard(item, cc).replace('<div class="hb-card' + (card.classList.contains('open') ? ' open' : '') + '"', '<div').replace(/^<div/, '').replace(/<\/div>$/, '');
  }
  renderHandbook();
}

/* ═══════════════════════════════════════════════════════════
   ПУБЛИЧНА ФУНКЦИЯ — извиква се от showModule() в shared.js
═══════════════════════════════════════════════════════════ */
function loadHandbook() {
  renderHandbook();
}
