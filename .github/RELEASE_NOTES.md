# 🏙️ BLOCK CITY TYCOON
**Build. Manage. Expand.** — Windows (64-bit, Windows 10/11) ve Android (7.0+)

## İndir
| Dosya | Ne için |
|---|---|
| **BLOCK-CITY-TYCOON-Setup-x.y.z.exe** | Kurulum sihirbazı: klasör seçimi (varsayılan `C:\Program Files\Block City Tycoon`), masaüstü kısayolu seçeneği, Başlat Menüsü kısayolu, Ayarlar → Uygulamalar'dan kaldırma |
| **BLOCK-CITY-TYCOON-Portable-x.y.z.exe** | Kurulumsuz: çift tıkla oyna; kayıtlar EXE'nin yanındaki `BLOCK CITY TYCOON Data` klasöründe |
| **BLOCK-CITY-TYCOON-Android-Release.apk** | Android 7.0+ telefon / tablet: APK'yı telefona indirip açın (ilk kez "bilinmeyen kaynaklardan yükleme" izni istenir). Güncellemeler mevcut uygulamanın üzerine kurulur, şehirler korunur |
| BLOCK-CITY-TYCOON-Android.apk | Geliştirici (debug) APK'sı |

> ⚠️ EXE dijital olarak imzalı değil. Windows ilk açılışta mavi bir uyarı gösterirse **Ek bilgi → Yine de çalıştır**'a basın.

## Nerede ne var (Windows + R)
- Kurulan oyun: `%ProgramFiles%\Block City Tycoon`
- Kayıtlar: `%APPDATA%\BLOCK CITY TYCOON\saves`
- Loglar: `%APPDATA%\BLOCK CITY TYCOON\logs`
- Ekran görüntüleri (F12): `shell:My Pictures` → `BLOCK CITY TYCOON`

## Eski tarayıcı kayıtları
Oyunu Chrome/Edge'de oynadıysanız: tarayıcıda Ayarlar → **📦 Export all saves** (veya **⬇️ Download .json**), sonra EXE'de **📦 Import old browser save** ile dosyayı seçin.

## 2.7.0 — Part 19: Advanced Transportation & Mobility 3.0 + Admin World Builder 2.0
Yeni **🚦 TRANSPORTATION** paneli (Windows: Transit sekmesinde **🚦 OPEN TRANSPORTATION** · Android: Ekonomi sayfasında **🚦 TRANSPORTATION** · komut paleti „Open Transportation"). Mevcut TrafficEngine (trafik 2.0, hatlar, kavşaklar, rota) korunur; TransportationEngine 3.0 onunla birlikte çalışır.
- **Metro:** istasyon kapasitesi, yolcu, bekleyen, kapsama, gelir, bakım; metro deposu ek tren kapasitesi verir.
- **Hat editörü:** hat oluştur, durak ekle / sil / taşı / yeniden sırala, renk, sefer sıklığı, tren veya otobüs sayısı, yeniden adlandır; oyuncunun durak sırası korunur.
- **Otobüs:** otobüs deposu, sefer saatleri ve sıklık. **Tren:** yolcu ve yük trenleri; yük treni sanayi ürününü taşır, gelir ekonomiye yazılır.
- **Havaalanı:** Small → Regional → International → Mega. **Liman:** Small → Cargo → Passenger → Industrial → Mega.
- **Bisiklet, yaya, otopark:** bisiklet şeritleri ve park yerleri, kaldırımlar ve yaya geçitleri, sokak parkı ve otoparklar, park arama süresi.
- **Traffic AI 3.0:** kavşak modları Fixed · Adaptive · Smart · Emergency Priority; toplu taşıma önceliği; tıkanıklık tahmini; dinamik rota (10 saniyede en fazla araçların %15'i, yalnızca ≥ %15 kazançta — herkes aynı yola kaçmaz); acil durum aracı 16 kare önden yeşil alır.
- **Dashboard:** 14 sayı, 10 ulaşım ısı haritası; ulaşım ekonomiye bağlı (yolculuk süresi → iş gücü, kapsama → lojistik, yük geliri, istasyon yakınında kira primi).
- **City Transport Generator:** 14 adım, Smart Metro ve Smart Bus; şehir boyutuna göre Small → otobüs + bisiklet + yaya · Medium → otobüs + metro adayı · Large → otobüs + metro + tren · Mega → hepsi.
- **Transport Validator + Auto Fix:** kopuk istasyon, çıkmaz hat, imkânsız ray, eksik depo, yolsuz bina, elektriksiz istasyon, kırık hat, geçersiz araç bulunur ve onarılır.
- **Admin World Builder 2.0** (yalnızca yetkili admin):
  - pipeline: Seed Validation → … → Transportation → Environment / Traffic Balance → Service Coverage → World Validator → Auto Fix (≤ 5 tur) → Balance → Performance → Final Validator; her aşamanın sonucu kaydedilir;
  - onarılamayan dünya **WORLD GENERATION FAILED** ile reddedilir ve önceki şehir geri yüklenir;
  - World Quality Score (10 kategori), Clean World Balancer, endüstri tamponu, su koruması;
  - 20 preset, 8 kalite profili, 16 testlik paket, WORLD HEALTH REPORT;
  - CREATE OPTIMIZED WORLD: PLAY yalnızca WORLD READY olunca.
- **175 admin aracı** (13 kategori), arama, favoriler, Ctrl+K (yalnızca admin), Ctrl+Z / Ctrl+Y geri al / yinele. Normal oyuncuda gizli ve reddedilir.
- **Save 3.2:** `transportation` bloğu; v2.6.0 kayıtları güvenli varsayılanlarla açılır; Windows ↔ Android.

## 2.6.0 — Part 18: Advanced Government, Public Services & City Governance 2.0
Yeni **🏛️ CITY MANAGEMENT** paneli (Windows: Şehir → Ekonomi veya **K** · Android: alt araç çubuğunda **🏛️ MANAGE** · komut paleti „Open City Management"). 13 sekme: Overview, Budget, Taxes, Healthcare, Education, Safety, Fire, Transport, Maintenance, Policies, Projects, Citizen Satisfaction, Reports. EconomyEngine 2.0, CitizenEngine, Emergency AI ve kayıt sistemi korunur; Government Engine bunlara bağlanır.
- **Government Engine:** Budget, Tax, PublicService, Healthcare, Education, Police, FireDepartment, Maintenance, UtilityService, TransportService, Policy, Project, CitizenSatisfaction, CityApproval ve GovernmentReport sistemleri; hizmetler / memnuniyet / bakım saatlik, bütçe / rapor / olaylar günlük; her alt sistem korumalı (hata oyunu durdurmaz).
- **City Budget:** gerçek ekonomi defterinden 11 gelir (Residential, Commercial, Industrial, Corporate, Tourism, Property, Service Fees, Transport, Utility, Grants, Special) ve 15 gider kalemi (Education, Healthcare, Police, Fire, Road Maintenance, Public Transport, Water, Electricity, Waste, Parks, Emergency, Construction Projects, Debt, Policies, Administration); gelir, gider, denge, borç, faiz, acil durum rezervi, aylık / yıllık değişim; BUDGET DEFICIT uyarısı; şehir kredileri.
- **Taxes:** Residential / Commercial / Industrial / Corporate %0–30, Property %0–20; gelir tahmini; doğrusal olmayan etkiler (mutluluk, büyüme, şirket geliri); Corporate tax şirket kârından alınır.
- **Public Services:** kapasite, kapsama, kalite, bütçe, çalışan, bakım ve memnuniyet; %0–150 finansman; Healthcare (Large Hospital ve Research Hospital eklendi, bekleme süresi, ambulans süresi), Education (nitelik → gelir, verimlilik, GSYH), Police (müdahale süresi, devriye, ilçe suç riski), Fire (trafik, yol durumu, mesafe, araç ve hava ile müdahale süresi; mevcut yangın sistemine bağlı).
- **Maintenance:** 9 ağ Excellent / Good / Warning / Critical / Failed; finansman Part 10 bakım ağlarını sürer; FAILED ağ gerçekten bozulur (elektrik kesintisi, su kaçağı, bina kapanması, köprü çökmesi uyarısı).
- **Citizen Satisfaction 2.0 + City Approval:** 12 bileşen, City Satisfaction, onay 0–100 (Excellent / Very Good / Stable / Warning / Critical / Collapse); vatandaş yorumları gerçek ilçe verisinden („The hospital near my home is excellent.", „Taxes are getting too high." …).
- **Policies:** 12 politika (Green City, Public Transport Priority, Free Education, Healthcare Investment, Industrial Incentive, Technology Incentive, Tourism Campaign, Road Maintenance Priority, Emergency Preparedness, Affordable Housing, Energy Efficiency, Recycling) — günlük maliyet, süre, fayda, yan etki, çakışma.
- **Government Projects:** 12 proje (New Hospital, University Campus, Airport Expansion, Metro Line, Fire HQ, Police HQ, Water Treatment, Power Plant, Recycling Center, Central Park, Mega Highway, Flood Defense) normal inşaat hattından (işçi + malzeme, şehir bütçesi); Low / Normal / High / Emergency öncelik (Emergency: hız ↑ maliyet ↑); dolu şehirde küçük varyanta düşer.
- **Government Events:** Hospital Overload, School Shortage, Police Shortage, Fire Emergency, Infrastructure Failure, Budget Crisis, Tax Protest (seçenekli kararlar) ve Construction Boom, Healthcare Breakthrough, Education Boom, Transport Upgrade, Infrastructure Recovery — gerçek şehir verisinden tetiklenir.
- **Rapor, danışman, harita:** günlük CITY GOVERNMENT REPORT; Smart Government Advisor („Hospital capacity is reaching 92%" …); 10 ısı haritası (Healthcare, Education, Police / Fire Coverage, Maintenance, Public Transport, Government Satisfaction, Tax Pressure, Service Quality, Infrastructure Risk) ve Government Service Map; ilçe yönetim tablosu.
- **Ekonomi ve konut bağlantısı:** vergiler → gelir, harcama → GSYH, eğitim → verimlilik, sağlık → iş gücü, ulaşım → lojistik, altyapı → şirket büyümesi, hizmetler → kira / mülk değeri (üst sınırlı), borç → faiz.
- **Save 3.1:** `government` bloğu (budget, taxes, services, policies, projects, approval, districts, reports); v2.5.0 kayıtları güvenli varsayılanlarla açılır; bozuk veri temizlenir; Windows ↔ Android.
- **Admin:** inspector (Government, Budget, Taxes, Services, Projects, Policies, Approval, District Coverage) ve `government.stats / budget / services / projects / approval / reset` komutları yalnızca yetkili OWNER / ADMIN / developer / debug kullanıcılarına; normal oyuncuda gizli.
- **Performans:** saatlik geçiş birkaç ms, ısı haritaları ve kapsama ızgaraları önbellekte; 100× hızda hafif.

## 2.5.0 — Part 17: Advanced Economy, Companies & Global Market 2.0
Yeni **📊 EKONOMİ MERKEZİ** (Windows: Şehir → Ekonomi · Android: Ekonomi sayfası · komut paleti „Open Economy"). Mevcut ekonomi motorları (tedarik zinciri, Company AI 2.0, Part 11 bankacılık, döngü ve TÜFE) korunur; Economy Engine 2.0 bunları genişletip birbirine bağlar.
- **Advanced Economy 2.0:** saatlik (piyasa, iş, konut, şirket grubu) ve günlük (kapanışlar, şirket finansalları, enflasyon, bankacılık, GSYH, duyarlılık, şoklar) tick'ler; her kare hesap yok, sabit zaman adımı korunur.
- **Dynamic Markets:** 18 ürün (Wheat, Flour, Bread, Food, Metal, Electronics, Fuel, Construction Materials, Medicine, Clothing, Technology …) için arz, talep, üretim, tüketim, ithalat, ihracat ve fiyat; fiyat oyun saatinde en fazla ≈ %1,8 hareket eder (sıçrama yok); günlük fiyat geçmişi ve grafik, 7 kategori ve ürün araması (mobil arama dahil).
- **Company AI:** tüm şirketler için kayıt: Startup → Growth → Established → Expansion → Mature ve Decline → Restructuring → Bankruptcy; iflas artık kademeli (önce yeniden yapılanma); HQ seviye 1–5; kredi notu; talep, rekabet, maliyet, stok, marka ve gelire göre fiyatlama; sektör pazar payı; iflas eden marka adı bir daha kullanılmaz.
- **Housing Market / Rental Market:** ilçe bazında ev fiyatı, kira, boşluk oranı ve erişilebilirlik (Very Affordable … Critical); talep ≫ arz → KONUT KRİZİ (kira ↑, mutluluk ↓, göç baskısı ↑); boş konut fazlası → kira ve inşaat ↓.
- **Banking · Loans · Mortgages:** merkez bankası (faiz hiçbir zaman %1'in altına inmez — 3 eski açık kapatıldı), para arzı, acil likidite; bankalar tablosu; krediler Late → Restructuring → Default; şirket ve vatandaş kredi notu; konut kredisi hesaplayıcı.
- **Trade:** ürün bazında ihracat / ithalat ve dış ticaret dengesi, lojistik maliyeti, depolar, ticaret aksaması.
- **GDP:** sektörlere göre GSYH (Industry, Services, Technology, Tourism, Construction, Retail, Transport), kişi başı GSYH, büyüme.
- **Inflation:** kategori bazında (gıda, kira, inşaat, maaş, hizmet, faiz) ve enflasyon beklentisi (fiyatları, maaş taleplerini ve yatırımı etkiler); maaşlar iş gücü açığına ve işsizliğe göre değişir.
- **Economic Cycles:** Expansion · Peak · Slowdown · Recession · Recovery.
- **Economic Crises:** Energy Price Shock, Food Shortage, Banking Crisis, Housing Bubble, Technology Boom, Market Crash, Trade Disruption, Construction Boom — Minor / Moderate / Major / Severe; ECONOMIC ALERT bildirimi ve her biri için iki politika seçeneği; oyuncunun parası asla sıfırlanmaz.
- **Advanced Stock Market:** yatırımcı duyarlılığı (Bullish … Panic), ekonomik haberler („… reports record profits", „… delivery delays", „Food prices rise …") hisse ve tüketiciyi etkiler.
- **Economic Dashboard:** GSYH, büyüme, enflasyon, işsizlik, ortalama maaş, konut fiyatı, kira, tüketici harcaması, şirket kârları, dış ticaret, faiz, vergi geliri, borç, borsa; hane bütçesi; 5 vergi türü (gelir, kurumlar, emlak, satış, turizm) ve uygulamadan önce gelir / mutluluk / iş büyümesi tahmini; grafikler 7 gün … 25 yıl; ekonomi danışmanı ve günlük rapor satırları.
- **Economic Heatmaps:** Business Demand, Rent, House Prices, Employment, Income, Commercial / Industrial Demand, Investment, Company Density, Housing Affordability.
- **Cross-platform Save Improvements:** ekonomi verisi kayıtta (piyasalar, fiyatlar, şirketler, bankacılık, krediler, konut, ticaret, GSYH, enflasyon, döngü, şoklar); v2.4.1 kayıtları varsayılanlarla açılır; Windows ↔ Android; tarayıcı depolama dolduğunda eski yedek bırakılır, kayıt kaybolmaz.
- **Large-city Optimization:** 10.000 şirkette saatlik geçiş ≈ 500 şirketlik gruplar halinde (birkaç ms), uzak şirketler basitleştirilmiş simülasyonla; şirket listesi sayfalı (25 satır); kompakt kayıt (10.000 şirket ≈ 1,5 MB); aynı kayıt + aynı adımlar → aynı ekonomi (seed'li rastgelelik).
- **Güvenlik:** ekonomi yönetici araçları (şok başlatma, döngü, tick) yalnızca OWNER / ADMIN; normal oyuncuda gizli.

## 2.4.1 — Part 16: v2.4.0 stabilizasyon / hardening sürümü
- **Performance hardening:** kare bütçesi ölçümü (input · simülasyon · UI · render · Visual Engine · ses · uzun duraklamalar), F3'te draw call sayacı, ışık / gölge / particle sayıları ve son yüklemenin aşama süreleri (Read · Migrate · Validate · World · Simulation · Visual). Kalite yöneticisi histerezisli: 5 sn düşük FPS → bir kademe düşüş, en az 20 sn bekleme, 30 sn iyi FPS → bir kademe geri; oturumda tek bildirim: „Performance reduced to keep the game stable." AUTO PERFORMANCE ile Visual Engine artık aynı anda iki kademe düşürmüyor.
- **Visual Engine optimization:** güneş / ışık hesabı oyun dakikasında bir kez (dirty flag), hava durumu 10 Hz, sis / pus gradyanları önbellekte, mekân ve geçit yolu önbellekte; pencereler, cephe pencereleri, sokak lambası renkleri, trafik ışıkları, ıslak yol / kar / su yansıması toplu (batch) çiziliyor; bina emojileri sprite önbelleğinden. Büyük şehir merkezinde draw call ~30.000 → ~13.500 (zoom 0.5, 1080p).
- **Memory leak fixes:** yağmur / kar damlaları havuzda (hava değişince atılmıyor), particle bütçesi 100 % → 66 % → 46 % → 27 % kademeli, emoji önbelleği sınırlı; fotoğraf modu, geçmiş, harita, hava, mevsim, etkinlik ve chunk streaming döngülerinde bellek / DOM / listener artışı yok (test edildi). Düşük bellek modu artık kalıcı değil: 3 dk sonra kalite kademe kademe geri gelir.
- **Save/load compatibility:** v2.4 / v2.3 / v2.2 / v2.1 kayıtları, geçmiş verisi olmayan eski kayıtlar, v11 → v12 göçü (ön yedekle), Windows ↔ Android kayıtları, bozuk ana kayıt → yedek ve masaüstü dosya deposu (.tmp → doğrula → yeniden adlandır, yarım kalan .tmp temizliği) otomatik test ediliyor. Aynı seed aynı şehri ve artık aynı vatandaşları üretiyor (deterministik vatandaş üretimi).
- **Mobile stability:** pil tasarrufu particle bütçesini yarıya indirir; arka plana geçince kayıt + ses durur; mobil UI testi 9 ekranda 297/297.
- **Photo Mode fixes:** telefonda fotoğraf çubuğu ekranın en fazla yarısını kaplar (şehir görünür ve dokunulabilir kalır); fotoğraf modunda kritik uyarı sahnenin üstüne çıkmaz, çıkışta gösterilir; sinematik kamera 1–120 sn, kamera ve City Tour harita dışına çıkmaz.
- **Weather stability:** 9 × 9 hava geçiş matrisi (sıçrama yok) ve 4 mevsim × 9 hava kombinasyonu test edildi; elektrik kesintisi gece / yağmur / fırtına / kar altında lambaları söndürür, kavşakları 4 yönlü dura alır ve „Power restored" ile geri gelir.
- **World streaming improvements:** chunk cache sınırlı, SMALL / MEDIUM / LARGE / HUGE dünyalar üretim, kayıt, yükleme ve çizimde ölçüldü.
- **CI reliability:** yeni `scripts/qa-test.js` (49 kontrol: Android + Windows profili, bekleme yerine wait-until), mobil UI ve QA hataları Test / Expected / Actual / Device / Resolution / Build / Commit ile raporlanır; araç ışıkları DAY / NIGHT / RAIN / FOG / BRAKING / TURNING / EMERGENCY durum makinesi.
- **Large-city optimization:** MEGA şehir + 500K nüfus + gece + fırtına + kesinti + festival + yoğun trafik + 100× senaryosu hatasız çalışıyor, kayıt ve yükleme sağlam; çizilen vatandaş / araç sayısı kalite sınırında, gerisi istatistiksel simülasyon. Ses havuzu (mobil 10 / masaüstü 20 ses) ve öncelik (acil > UI > olay > efekt > ortam) test edildi; çift siren sesi kaldırıldı. Yalnızca ikon üretim kaynakları (icon.svg, icon-256.png) EXE / APK paketinden çıkarıldı.

## 2.4.0 — Part 15: Visual Engine 2.0, atmosfer ve yaşayan şehir
- **Visual Engine 2.0:** mevcut renderer genişletildi — LOW / MEDIUM / HIGH / ULTRA kalite seviyeleri, yavaş veya ısınan cihazda otomatik düşüş, particle bütçesi 100 / 300 / 800 / 1500.
- **Day/Night:** Dawn · Morning · Noon · Evening · Night · Midnight · Late Night; mevsime göre gün uzunluğu; güneş açısı, yoğunluk, renk sıcaklığı ve gölge yönü.
- **Dynamic Lighting & Street Lights:** yol tipine göre sokak lambaları, ilçe renkleri, LOD'lu pencere ışıkları ve saate göre doluluk, neon tabelalar, landmark projektörleri, uçak ikaz ışıkları.
- **Power-based lighting:** elektrik kesintisinde lambalar ve trafik ışıkları söner (kavşaklar 4 yönlü dur), binalar acil durum ışığına geçer, bildirim gelir.
- **Vehicle Lights:** farlar (gece, yağmur, sis, kar), fren lambası, sinyal, tekerlekler, acil araç ışıkları ve siren.
- **Weather:** yumuşak geçişler (Clear → Cloudy → Rain → Heavy Rain → Storm), ıslak yollar ve su birikintileri, kar örtüsü, sis, bulut gölgeleri; sis / kar / fırtına araç ve acil durum hızını hafifçe etkiler.
- **Seasons:** sonbahar yaprak geçişi, ilkbahar çiçekleri, rüzgâra göre sallanan ağaçlar, su yansıması ve kıyı köpüğü.
- **Building Animations:** inşaat ekipleri ve kamyonlar, seviyeye göre çatı detayları, seviye 5 / 8 / 10'da değişen Mega Mall ve Arcology.
- **Living City & City Atmosphere:** ilçe kimliği (Downtown, Financial District, Industrial Zone, Old Town, Tourism District, Tech Valley, Suburbs, Luxury Coast), gece hayatı, yeni etkinlikler (konser, spor finali, sokak pazarı, resmî tatil, geçit töreni), şehir evrimi ve silüet, mesafe / kirlilik pusu, bölgeye göre ambiyans sesi.
- **Photo Mode 2.0:** 8 hava durumu, HIDE UI, derinlik efekti, simülasyonu duraklatma, sinematik kamera (A → B), CITY TOUR; **City History** grafikleri ve Year 1 / 5 / 10 / 25 karşılaştırması.
- **Performance Improvements:** ekrandaki vatandaş çizimi seviyeye göre sınırlı, chunk yükleme geçişi (fade), ses havuzu ve öncelik; v2.3.0 ile aynı kare süresi, kayıt süresi ve bellek.
- **Testler:** Android self-test 30 adım, mobil UI testine gece / yağmur, Photo Mode 2.0 ve döndürme regresyonu eklendi; Part 14 düzeltmeleri (minimap, yorum balonu, danışman düğmesi, gamepad zamanlaması) korunuyor.

## 2.3.0 — Part 14: Mobile 2.0, dokunmatik UX, performans ve sürüm kalitesi
- **Platform adapter:** ortak oyun motoru + `AndroidPlatformAdapter` / `WindowsPlatformAdapter`; dağınık `if Android` kontrolleri yerine tek katman. Ortak **Action** sistemi (dokunma · fare · klavye · kontrolcü).
- **HUD 2.0:** seviye · şehir · tarih / nüfus · mutluluk / para · elektrik · su; **≡** ile FULL → COMPACT → MINIMAL (araç çubuğu TOOLS ▲ tutamacına katlanır).
- **Akıllı seçim:** SELECT OBJECT seçici, daha büyük dokunma alanları, uzun bas (kare bilgisi), çift dokunarak yakınlaştırma.
- **Inspector 2.0:** sekmeler; yol trafiği (Traffic %, araç/saat, ortalama hız) ve yol düzenleme (tür, uzat, böl, trafik ışığı, göbek, sil); vatandaş / araç TRACK, ROUTE, ETA.
- **UNDO:** yol, bina, bölge ve yıkım geri alınır (Android: ↶ UNDO, Windows: Ctrl+Z); yıkım her zaman KEEP / DEMOLISH sorar.
- **Hız sayfası** (⏸ … 100×), **arama** (bina, vatandaş, yol, ilçe, şirket, araç, konum), **görevler** (GO TO LOCATION), **günlük rapor**, **HELP**.
- **Kritik uyarılar** (VIEW · DISPATCH · IGNORE, oyun durmaz), konumlu bildirimler, başarım açılır kutusu, 💡 akıllı danışman, vatandaş yorumları.
- **Minimap 2.0** (boyut, tam harita, kapat, acil durum işaretleri) ve tam haritada 11 ısı haritası.
- **Ayarlar 11 kategori:** güç modları (Performance / Balanced / Quality / Battery Saver), kamera hızları ve ters çevirme, Gesture Camera (kapalı → ＋/－), ses kanalları (Music / SFX / UI / Environment), titreşim, UI Scale 80–130 %, otomatik kayıt OFF / 5 / 10 / 15 / 30 dk, olay anlık görüntüleri.
- **Kayıt güvenliği:** Android'de doğrulamalı atomik yazma + `.bak` yedeği, arka planda kayıt, olay öncesi/sonrası otomatik anlık görüntüler, dostça hata ekranı (RETURN / RECOVER SAVE).
- **Pil ve performans:** menüde / boşta 30 FPS, arka planda 15 FPS ve ses durur; Battery Saver; dokunmatik fotoğraf modu (HIDE UI).
- **Güvenlik:** MOBILE STRESS TEST yalnızca geliştirici / test build'lerinde veya yetkili admin oturumunda; normal oyuncu admin / debug arayüzü görmez.
- **Testler:** mobil UI testi 9 ekran × 30 kontrol; Android self-test 28 adım. Windows EXE davranışı değişmedi.

## 2.2.0 — Part 13: Android mobil arayüz, dokunmatik kontroller ve tam oynanabilirlik
- **Gerçek mobil arayüz (PC arayüzü küçültülmedi):** Android'de masaüstü üst çubuk, sol menü, araç çubuğu ve paneller kapanır; oyun mantığı aynı, arayüz katmanı platforma göre değişir.
- **Responsive UI motoru:** ekranın kısa kenarına göre tek ölçek birimi, **UI SCALE** (80–140 %), **LARGE TOUCH BUTTONS**, cihaz DPI'sına göre en küçük okunabilir yazı ve en az 42 px dokunma alanı. HUD kendini sıkıştırır; hiçbir öğe üst üste binmez veya ekran dışına çıkmaz (otomatik **UI bounds** denetimi + düzeltme).
- **Safe area:** çentik, kamera deliği, yuvarlak köşeler ve hareket çubuğu (Android kabuğu → `bctInsets`) hesaba katılır.
- **Mobil HUD:** sol üst şehir · para · nüfus, üst orta seviye · tarih, sağ üst mutluluk · elektrik · su · 🔔 · ☰. Alt kısım boş: sadece **BUILD · ROAD · ZONE · TRANSPORT · CITY · ECONOMY · MAP** araç çubuğu. Solda ⏸ · hız · 🎯 kamera sıfırlama · 🧭 minimap.
- **Build menüsü:** alt sayfa (telefon) / yan panel (tablet), 8 kategori (Residential, Commercial, Industrial, Services, Parks, Utilities, Transport, Special), simge · ad · fiyat · gerekli seviye gösteren dokunulabilir kartlar; X veya aşağı kaydırma ile kapanır.
- **Build modu:** hayalet önizleme (yeşil **BUILDABLE** / kırmızı **CANNOT BUILD** + sebep), haritaya dokun / hayaleti sürükle → **ROTATE · CANCEL · CONFIRM**. Hızlı çift basış iki bina yapmaz.
- **Yol ve bölge modu:** Small · Medium · Large · Highway · Bridge · Tunnel, **START → DRAG → END → CONFIRM**.
- **Dokunmatik kamera:** tek parmak kaydırma, iki parmak pan, pinch zoom, iki parmak döndürme — zoom ve döndürme aynı harekette karışmaz; çoklu dokunuşta bina seçme / yol çizme / tıklama tetiklenmez. **Camera Sensitivity** (Low / Medium / High).
- **Inspector kartları:** bina (seviye, durum, işçi, gelir, elektrik, su, UPGRADE, iki adımlı DEMOLISH, önemli binada ikinci onay), vatandaş, araç ve yol (tip, kapasite, trafik, durum, hız, yükseltme).
- **CITY ve ECONOMY sayfaları** (kartlar + kaydırma / pinch zoom / ekranda kalan tooltip'li grafikler), tam ekran **CITY MAP** (yollar, bölgeler, binalar, toplu taşıma, su, elektrik; dokunduğun yere kamera gider).
- **Bildirimler:** küçük toast'lar, yoğunlukta **🔔 bildirim merkezi**; görevler / olaylar yan panelde.
- **Pause menüsü:** RESUME · SAVE (tek dokunuş, *SAVING CITY... → CITY SAVED*) · SETTINGS · CONTROLS · EXIT TO MENU. **Geri tuşu:** oyun → pause, pause → devam, build → iptal, harita → kapat, panel → kapat; ilk basışta uygulama asla kapanmaz.
- **Mobil ayarlar (kartlar):** Graphics (LOW / MEDIUM / HIGH / ULTRA / AUTO, **FPS hedefi** AUTO / 30 / 45 / 60, FPS göstergesi), Controls, Camera, Audio, Simulation (otomatik kayıt varsayılanı 5 dk + önemli olaylardan sonra), Accessibility.
- **Dikey ekran:** oyun sırasında **PLEASE ROTATE YOUR DEVICE** (ya da Ayarlar'dan dikey düzen). Tablette geniş düzen.
- **Dokunmatik eğitim:** Kamera · Zoom · Build · Road · Map · Economy · Save, NEXT / SKIP.
- **Kararlılık:** WebView çökerse uygulama kapanmaz, görünüm yeniden kurulur ve son autosave korunur; hata fırtınasında **ERROR RECOVERY**; Android düşük bellek uyarısında **LOW MEMORY MODE** (uzak chunk / doku boşaltma, ajan birleştirme, daha az parçacık ve gölge).
- **Admin kuralı aynen:** normal kullanıcı admin göremez, Android'de F10 gibi masaüstü kısayolları **ADMIN COMMAND DENIED**; yetkili admin paneli telefonda tek, tablette iki/üç sütun.
- **Testler:** Android self-test 24 adım (yeni: UI bounds, dokunma önceliği, harita / sayfalar / kayıt), `npm run test:mobile-ui` 8 ekran boyutunda (720×1280, 1080×1920, 1080×2400 çentikli, 1440×2560, 21:9, tablet ×2, dikey) tüm ana ekranları gerçek dokunmatik olaylarla dener.

## 2.1.0 — Türkçe dil desteği
- **Oyunun tamamı Türkçe:** menüler, HUD, paneller, binalar, teknolojiler, hikâye, görevler, eğitimler, başarımlar, haberler, bildirimler, ayarlar, admin paneli ve harita etiketleri. Windows, Android ve tarayıcıda aynı.
- **Ayarlar → SİSTEM → Dil** (English / Türkçe) ve ilk açılış kurulumunda dil seçimi; değişiklik anında uygulanır. Cihaz dili Türkçe ise oyun Türkçe başlar.
- Kayıtlar dilden bağımsız: Türkçe oynanan şehir İngilizce de açılır.

## 2.0.0 — Part 12: Windows EXE + Android APK + Güvenli Admin Sistemi
- **Android APK:** aynı oyun motoru (ekonomi, vatandaşlar, trafik, dünya, kayıt, simülasyon, görevler, başarımlar) Android'de; izin istemeyen, çevrimdışı, tam ekran uygulama. Sistem açılış ekranı + adaptive ikon, yatay öncelikli (dikey / otomatik seçilebilir), geri tuşu, Bluetooth gamepad.
- **Mobil arayüz:** Android ana menüsü (NEW CITY · CONTINUE · SANDBOX · SCENARIO · CHALLENGES · SETTINGS), kompakt HUD (Money · Population · Happiness · GDP · Power · Water) ve alt çubuk (Build · Road · Transit · Economy · City · Map), dokunmatik kamera (kaydırma, pinch zoom, iki parmak döndürme), **BUILD · ROTATE · MOVE · CONFIRM · CANCEL** inşa modu ve yol / elektrik / su / bölge / arazi kontrolleri, **START → DRAG → END → CONFIRM** yol çizici (Small · Medium · Large · Highway · Bridge · Tunnel).
- **Performans:** LOW / MEDIUM / HIGH / ULTRA + **AUTO PERFORMANCE** (cihaz testi, FPS ve ısınma takibi), **LOW-END MODE**, simülasyon kalitesi, **güvenli hız limiti** (100× ağır gelirse otomatik düşer).
- **Settings 2.0:** GRAPHICS · AUDIO · CONTROLS · CAMERA · SIMULATION · ACCESSIBILITY · SYSTEM; UI ölçeği, yazı boyutu, yüksek kontrast, azaltılmış hareket, sarsıntı kapalı, renk körü dostu heatmap, büyük dokunmatik düğmeler, eğitim ipuçları; atanabilir gamepad; oyun içi bildirimler; ilk açılış kurulumu ve mobil eğitim.
- **Ortak kayıt (CITY_SAVE_V4, v12):** Windows kaydı Android'de, Android kaydı Windows'ta açılır; platform, şehir kimliği, revizyon ve checksum; grafik / erişilebilirlik ayarları cihazda kalır. Güncellemede önce **yedek**, sonra **geçiş**, hata olursa **geri alma**; Android'de arka plana alınınca otomatik kayıt ve **RECOVER CITY**.
- **Güvenli admin sistemi:** admin paneli normal oyuncuda tamamen gizli (menüde / ayarlarda / HUD'da yok, F10 hiçbir şey yapmaz). **ADMIN AUTHENTICATION** (Windows: Ctrl+Shift+F10, Android: sürüm yazısına 7 dokunuş) — şifre kodda yok, tuzlu PBKDF2 doğrulaması; **OWNER / ADMIN / DEVELOPER / DEBUG** rolleri ve gerçek izin matrisi; her komutta yetki kontrolü (konsol, kısayol, URL, local storage ve kayıt düzenleme ile çalıştırılamaz); oturum, **LOG OUT**, **otomatik kilit** (10 dk), başarısız giriş koruması, **admin işlem günlüğü**, owner kurtarma kodu, WORLD CONTROL CENTER GUIDE.
- **Build sistemi:** `npm run build:windows` → `dist/windows/`, `npm run build:android` → `dist/android/`; DEVELOPMENT / TEST / RELEASE profilleri; release APK imzalı.
- **Otomatik test:** Windows EXE 53 adım (admin güvenliği, Windows ⇄ Android kayıt, kayıt / snapshot / sürüm geçişi dahil), Android APK 21 adım — release iş akışında APK bir Android emülatöründe test edilir.

## 1.4.0 — Part 11: Gelişmiş şehir simülasyonu, ulaşım AI ve derin ekonomi
- **Birleşik ulaşım motoru** ve **çok modlu rota:** vatandaşlar yürüme, bisiklet, araba (otopark arama), toplu taşıma, aktarma ve park & ride arasında süre/maliyet/trafik/aktarma/konfora göre seçim yapar.
- **Traffic Light AI 2.0**, **acil durum koridoru**, **göbekli kavşak AI** (ROUNDABOUT CONGESTION), yol olayları ve yeniden rota, **oyuncu yol çalışmaları** (şerit kapatma → kapasite artışı).
- **Metro motoru** + **metro hat oluşturucu** (A → B, önerilen güzergâh, düzenlenebilir) + **STATION OVERLOAD**; **tren ağı** (yolcu, kargo, yüksek hızlı) ve komşu şehirlere **bölgesel trenler**.
- **Dinamik ticaret rotaları** (karayolu/demiryolu/deniz/hava) ve **ticaret sözleşmeleri** (RENEW / CANCEL).
- **Company Finance 2.0**, **şirket borcu + BANKRUPTCY RISK**, **banka sistemi** (mevduat, kredi, mortgage, faiz), **faiz motoru** (INTEREST RATE ≥ %1 korunur).
- **Mortgage**, **konut / kira / ticari piyasa**, **piyasa fiyatları**, **gıda ağı**, **şehir tüketimi**, oyuncudan etkilenen **ekonomik döngüler**.
- **City Budget 2.0**, **5 yıllık bütçe tahmini**, **FINANCIAL HEALTH 0–100**.
- **Bina iç mekânları**, **aktivite programları**, **bina enerji AI + SMART BUILDINGS**, **Building Upgrades 2.0** (9 kol).
- **Otopark**, **yaya ağı**, **bisiklet ağı**, ilçe başına **WALKABILITY SCORE**.
- **Akıllı şehir sensör ağı + veri merkezi**, **tahmin sistemi**, **kestirimci bakım**, **RISK MAP**.
- **Yangın yayılımı**, **sel simülasyonu**, **iklim uyumu**, **yeşil şehir**, **enerji depolama**, **akıllı şebeke**, **atık yönetimi** ve **geri dönüşüm ekonomisi**.
- **Admin:** 13 yeni bölüm; ulaşım, ekonomi, bina ve vatandaş komutları; **WORLD PAINTER** fırçaları; **Ctrl çoklu seçim editörü**; kamerayı uçuran **canlı varlık araması**; **CITY BOOK**.
- **Kayıt v11:** v10 kayıtlar otomatik yükseltilir. Self-test 40 adım (Part 11 final dünya testi dahil).

## 1.3.0 — Part 10: Living World, gelişmiş ekonomi ve Advanced Simulation
- **Living World Engine:** şehir kendi kendine yaşar — yeni şirketler, mağaza açılış/kapanışları, iş değiştiren vatandaşlar, taşınan haneler, yeni mahalleler, değişen arazi fiyatları, trafik, turizm ve ticaret.
- **Yaşam döngüsü** (sabah/öğle/akşam/gece/hafta sonu, gece vardiyası) ve **dinamik nüfus** (doğum, ölüm, MIGRATION IN/OUT).
- **Eğitim hattı** (Lise, Kolej yeni), **araştırma alanları**, **hastane sistemi** (Klinik, Medical Center, University Hospital, HEALTHCARE OVERLOAD, gerçek ambulans rotası).
- **Tourism 2.0** + 6 yeni cazibe merkezi, **havaalanı** (terminal, kargo, AIRPORT CONGESTION), **liman** (TEU, Container/Cruise Terminal), **Rail Hub**, **lojistik ağı** (Distribution Center), **tedarik şokları** ve çözümleri.
- **Company AI 2.0**, rekabet, **dinamik markalar**, **Stock Market 2.0**, **City News** (gerçek ve ölçülen etkiler), **itibar 0–1000**, **yıllık dünya şehir sıralaması**, **bölgesel rekabet**.
- **Arazi gelişimi** (AUTO DEVELOPMENT), **9 megaproje** + kilometre taşları + **Project Manager**, **bakım bütçeleri**, **altyapı yaşlanması** (REPAIR/UPGRADE/REPLACE), **Incident Center**.
- **Vatandaş görüşleri & dilekçeler**, **uzun vadeli hedefler**, **dinamik görevler**, **akıllı otomasyon** (9 anahtar), **City AI Assistant**.
- **Living City hub (J)**, **CITY DASHBOARD (U)**, **WORLD OBSERVATORY (O)**, **canlı grafikler**, **Command Palette 2.0 (Ctrl+Shift+P)**.
- **Admin:** Simulation Lab, What-If (APPLY/DISCARD), Time Machine, World Factory, **World Presets 2.0** (13 preset), **GENERATE MEGA WORLD** (22 adım) + **World Generation Score**, admin arama 2.0.
- **Kayıt v10:** v9 kayıtlar otomatik yükseltilir. Self-test 30 adım.

## 1.2.0 — Part 9: World Engine, devasa dünya ve World Control Center
- **Chunk tabanlı dünya motoru:** 16×16 chunk'lar, bölgeler (Central/North/South/East/West), zemin akışı (streaming) ve NEAR/MID/FAR simülasyon katmanları; yeni **GIGA 128×128** harita ve **CREATE NEW REGION** (160×160'a kadar).
- **Komşu şehirler** (METRO, RIVER, INDUSTRIAL, COASTAL, TECH, OLD TOWN): yolcu, turist, ticaret, kargo, hammadde ve enerji akışı.
- **Trafik 2.0:** şeritler, şerit değiştirme, trafik ışığı AI, göbekli kavşak, öncelikli yol, alternatif rota AI, trafik olayları ve anında yeniden rota; **Emergency AI 2.0**.
- **Toplu taşıma ağı:** otobüs, tramvay, metro, tren, feribot, havaalanı servisi — durak → hat → araç → yolcu.
- **Şehir yaşamı:** haneler, emlak piyasası, aşamalı inşaat (işçi + malzeme), bina durumu ve bakım ekipleri.
- **Altyapı 2.0:** trafo merkezli güç şebekesi (OVERLOAD), basınçlı su ağı ve boru patlamaları, kanalizasyon (SEWAGE OVERLOAD).
- **Çevre ve Weather 2.0:** rüzgârla yayılan kirlilik, gürültü/hava/su/toprak kalitesi haritaları, sağanak ve soğuk hava dalgası dahil 9 hava türü.
- **World Control Center (F10, önce admin modu açılmalı):** dünya sağlığı çubuğu, 16 hızlı eylem, Entity Inspector, World Brush, bölge seçici, Disaster Command Center, Snapshot 2.0 + dallanma, klonlama, zaman çizelgesi ve şehir tarihçesi, World Achievements 2.0, meydan okuma üretici, sürekli Validator 2.0 + AUTO FIX, Smart Advisor 2.0.
- **Kayıt v9 (Save 3.0):** eski kayıtlar otomatik yükseltilir.
- **Otomatik EXE testi:** her derlemede yeni EXE `--selftest` ile 20 adımda (yeniden başlatma dahil) test edilir; rapor `selftest-report.json` olarak sürüme eklenir.
