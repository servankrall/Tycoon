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
