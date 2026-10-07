# 🏙️ BLOCK CITY TYCOON — Windows Desktop Edition

**Build. Manage. Expand.** · Sürüm **1.3.0** · Kayıt formatı **v10**

Tarayıcıda çalışan BLOCK CITY TYCOON (Part 1–6'daki tüm sistemleriyle) artık bir **Windows masaüstü uygulaması**:
`BLOCK CITY TYCOON.exe`, kurulum sihirbazı (installer) ve kurulum gerektirmeyen portable EXE. Oyun tamamen **çevrimdışı** çalışır: sunucu, harici API veya internet bağlantısı gerekmez.

---

## 1. Gereksinimler

| | |
|---|---|
| İşletim sistemi | Windows 10 / 11 (64-bit) |
| Geliştirme / build | [Node.js](https://nodejs.org) 20 LTS veya üstü (npm dahil) |
| İlk `npm install` / ilk build | İnternet (Electron ve NSIS araçları bir kez indirilir) |

Oyuncunun bilgisayarında Node.js, Chrome veya terminal **gerekmez**; yalnızca EXE yeterlidir.

## 2. Komutlar

```bash
npm install        # bağımlılıklar (electron, electron-builder)
npm run dev        # oyunu geliştirici modunda aç (Ctrl+Shift+I = DevTools, Ctrl+R = yeniden yükle)
npm start          # oyunu oyuncu modunda aç (DevTools kapalı)
npm run build      # Windows installer + portable EXE → dist/
npm run check      # build öncesi kontrol (tüm dosyalar, sözdizimi, ikon)
npm run icon       # icon.svg'den icon.ico / icon.png'yi yeniden üret (isteğe bağlı)
```

`npm run build` sonrası:

```text
dist/
├── BLOCK-CITY-TYCOON-Setup-1.3.0.exe      ← kurulum sihirbazı
├── BLOCK-CITY-TYCOON-Portable-1.3.0.exe   ← kurulumsuz, çift tıkla çalışır
└── win-unpacked/BLOCK CITY TYCOON.exe     ← paketlenmiş uygulamanın kendisi
```

> **SmartScreen:** EXE dijital olarak imzalanmadığı için Windows ilk açılışta *"Windows kişisel bilgisayarınızı korudu"* diyebilir → **Ek bilgi → Yine de çalıştır**. İmzalamak için electron-builder'a bir kod imzalama sertifikası verin (`CSC_LINK`, `CSC_KEY_PASSWORD`).

## 3. Installer

- Başlık: **BLOCK CITY TYCOON Setup**
- Kurulum klasörü seçilebilir; varsayılan: `C:\Program Files\Block City Tycoon\`
- **☑ Create Desktop Shortcut** seçeneği (varsayılan işaretli) — `build/installer.nsh`
- Başlat Menüsü kısayolu her zaman oluşturulur
- **Ayarlar → Uygulamalar → Yüklü uygulamalar** listesinden kaldırılabilir (Uninstall)
- Kaldırma işlemi kayıtlarınızı **silmez** (`%APPDATA%\BLOCK CITY TYCOON`)

**Portable EXE:** kurulum istemez; kayıtlarını EXE'nin yanındaki `BLOCK CITY TYCOON Data\` klasörüne yazar (USB bellekte taşınabilir).

## 4. Proje yapısı

```text
BLOCK-CITY-TYCOON/
├── package.json            scriptler + electron-builder (nsis + portable) ayarları
├── package-lock.json
├── main.js                 Electron ana süreç: pencere, IPC, kayıt dosyaları, çökme kurtarma, dialoglar
├── preload.js              güvenli köprü (window.bct) — contextIsolation: true, nodeIntegration: false, sandbox
├── electron/
│   ├── storage.js          kayıt anahtarı → dosya eşlemesi, atomik yazma (.tmp → doğrula → değiştir)
│   ├── logger.js           logs/latest.log (+ previous.log)
│   ├── session.js          session.lock ile beklenmeyen kapanma tespiti
│   └── updater.js          güncelleme altyapısı (kontrol / sürüm / indir / kur) — internet olmadan sorunsuz
├── build/
│   └── installer.nsh       varsayılan klasör + "Create Desktop Shortcut" sayfası + kaldırma
├── scripts/
│   ├── check.js            build öncesi doğrulama
│   └── make-icon.js        SVG → ICO (16, 24, 32, 48, 64, 128, 256 px) + PNG
└── src/                    oyunun kendisi (renderer)
    ├── index.html          açılış ekranı (splash), menüler, oyun arayüzü
    ├── css/styles.css
    ├── assets/icons/       icon.ico · icon.png · icon-256.png · icon.svg
    └── js/
        ├── boot/loader.js      dosyaları sırayla yükler, gerçek yükleme ilerlemesini gösterir
        ├── platform.js         masaüstü ⇄ tarayıcı katmanı: Store, Log, settings.json, dialoglar, ekran görüntüsü
        ├── config.js           sabitler, kalite ön ayarları, binalar, teknolojiler, görevler, başarımlar
        ├── data-city.js        arazi, kaynaklar, ürünler, rakip şirketler, dünya şehirleri
        ├── save.js             Save 2.0: durum, 4 şehir yuvası, migration v1→v7, doğrulama, import/export
        ├── world.js            harita, arazi üretimi, yollar, yerleşim, pathfinding
        ├── economy.js          arz/talep, iş gücü, elektrik, su, araştırma
        ├── economy-market.js   üretim zincirleri, depolar, lojistik, pazar, ticaret
        ├── events.js           krizler, afetler, küresel olaylar, danışman
        ├── citizens.js         vatandaş AI, araçlar, trafik AI, acil durum araçları
        ├── renderer.js         canvas çizici, parçacıklar, hava durumu, efektler
        ├── ui.js               paneller, pencereler, iç mekânlar, öğretici
        ├── p5-data.js / p5-profile.js / p5-systems.js / p5-ui.js   hikâye, profil, faiz, yatırımlar, fotoğraf modu
        ├── admin.js            admin paneli
        ├── city-systems.js     rakip şirket AI, kontratlar, inşaat
        ├── game.js             oyun motoru: sabit zaman adımı, sistem kayıtları
        ├── simulation-data.js / simulation.js / simulation-ui.js   enflasyon, borsa, krizler, heatmap, F3, istatistik
        ├── audio.js            Web Audio ses ve müzik
        ├── worldgen.js         dünya üretici, World Validator, otomatik onarım (FIX WORLD), World Health, World Debugger
        ├── admin-center.js     Admin Kontrol Merkezi: 20 kategori, komut konsolu, snapshot/rollback, stres testi, benchmark, admin.log
        ├── world-engine.js     Part 9: chunk/bölge motoru, zemin akışı (streaming), NEAR/MID/FAR simülasyon katmanları, bölge istatistikleri, komşu şehirler, yeni bölge açma
        ├── traffic2.js         Part 9: şeritli trafik, kavşaklar + trafik ışığı AI, alternatif rota AI, trafik olayları, Emergency AI 2.0, toplu taşıma ağı
        ├── citylife.js         Part 9: haneler, emlak piyasası (arazi değeri), Construction 2.0, bina bakımı (condition)
        ├── utilities2.js       Part 9: güç şebekesi (santral→trafo merkezi→trafo→bölge→bina), su basıncı ağı, kanalizasyon, çevre (rüzgârla kirlilik, gürültü, su/toprak), Weather 2.0
        ├── world-control.js    Part 9: World Control Center, Entity Inspector, World Brush, bölge seçici, Disaster Command Center, Snapshot 2.0 + dallanma, klonlama, zaman çizelgesi, meydan okumalar, Validator 2.0, Smart Advisor 2.0
        ├── living-world.js     Part 10: Living World Engine, şehir yaşam döngüsü, dinamik nüfus (doğum/ölüm/göç), Company AI 2.0, dinamik markalar, Stock Market 2.0, City News (gerçek etkiler), itibar 0–1000, dünya sıralaması, bölgesel rekabet, arazi gelişimi, akıllı otomasyon
        ├── services2.js        Part 10: eğitim hattı (ilkokul → lise → kolej → üniversite → araştırma), araştırma alanları, hastane sistemi + HEALTHCARE OVERLOAD + ambulans rotası, Tourism 2.0 + cazibe merkezleri, havaalanı, liman (TEU), demiryolu yükü + Rail Hub, lojistik ağı, tedarik şokları
        ├── projects-lab.js     Part 10: megaprojeler + kilometre taşları, bakım bütçeleri, altyapı yaşlanması, Incident Center, vatandaş görüşleri/dilekçeleri, uzun vadeli hedefler, dinamik görevler, AI Assistant, canlı grafikler, Time Machine, Simulation Lab, What-If, World Factory, Presets 2.0, GENERATE MEGA WORLD (22 adım), World Generation Score
        ├── p10-ui.js           Part 10: Living City hub (J), tam ekran City Dashboard (U), World Observatory (O), Command Palette 2.0 (Ctrl+Shift+P), World Control Center Part 10 sekmeleri, admin arama 2.0
        ├── selftest.js         Part 9/10: otomatik 30 adımlı EXE testi (--selftest)
        ├── main.js             döngü, girdi, menüler, açılış adımları
        └── platform-ui.js      çıkış onayı, çökme kurtarma, eski kayıt aktarımı, masaüstü ayarları, kısayollar
```

Binalar, araçlar ve vatandaşlar canvas üzerinde prosedürel çizildiği için ayrı görsel dosyaları yoktur. Bir asset (ör. ikon) eksikse oyun yedek görünümü kullanır ve durumu `latest.log`'a yazar.

## 5. Kayıtlar, ayarlar, loglar

Hepsi `%APPDATA%\BLOCK CITY TYCOON\` altında (Electron `app.getPath("userData")`):

```text
BLOCK CITY TYCOON\
├── saves\
│   ├── city_01.json … city_04.json            CITY 01–04 (her şehir ayrı kayıt)
│   ├── city_01.backup.json …                  bir önceki kayıt (otomatik yedek)
│   ├── recovery.json                          çökme kurtarma anlık görüntüsü (15 sn'de bir)
│   └── active_slot.txt                        son oynanan şehir (CONTINUE)
├── settings.json                              genel ayarlar
├── snapshots\snapshot_001.json …           admin dünya snapshot'ları (rollback için, en fazla 20)
├── admin-presets.json                         kaydedilmiş admin ön ayarları
├── profile.json                               oyuncu profili (unvanlar, rozetler, meydan okumalar)
├── logs\latest.log  (+ previous.log)          ·  logs\admin.log (her admin işlemi)
└── session.lock                               oyun açıkken var; temiz çıkışta silinir
```

- **Bozulmaya karşı:** her yazma önce `city_01.json.tmp` dosyasına yapılır, diske yazılır, geri okunup doğrulanır (JSON ayrıştırılır), ancak sonra `city_01.json` ile değiştirilir. Oyun ayrıca kayıttan önce durumu doğrular ve bir önceki kaydı `.backup.json` olarak saklar.
- **Otomatik kayıt:** varsayılan AÇIK, 30 saniyede bir (15 sn – 5 dk ayarlanabilir). Ayrıca büyük krizden önce, afet raporundan sonra, ana menüye dönerken ve çıkarken kaydeder.
- **Ekran görüntüleri:** `Resimler\BLOCK CITY TYCOON\` (F12 veya fotoğraf modundaki PNG dışa aktarma).
- **settings.json:** `resolution, fullscreen, borderless, music, sfx, masterVolume, graphics, particles, shadows, npcDensity, trafficDensity, autosave, autosaveInterval, language, pauseOnBlur`.

### Kayıt formatı (Save 2.0, v7)

Her kayıt `header` bölümü taşır: `saveVersion, gameVersion, timestamp, citySeed, cityName, slot, playSec, population` ve her bölümün JSON içindeki yeri (`player, economy, citizens, buildings, roads, vehicles, companies, stocks, research, quests, achievements, statistics, settings`). v7 ile yoldaki kamyon/tanker/çöp kamyonu/otobüsler kargo ve varış noktalarıyla birlikte kaydedilir.

v10 (1.3.0) ile kayda `p10` bölümü eklendi: Living World (şirket meta verileri, markalar, borç, haberler ve aktif etkileri, itibar, yıllık sıralamalar, nüfus geçmişi), eğitim/araştırma/sağlık durumu, havaalanı/liman/demiryolu toplamları, tedarik şokları, megaprojeler, bakım bütçeleri, altyapı varlıkları (yaş, durum, seviye), olaylar, dilekçeler, hedefler, canlı grafikler, Time Machine anlık görüntüleri ve otomasyon anahtarları. Binalara `born` (yapım günü), `grade` (yükseltme seviyesi) ve `mega` (megaproje inşaatı) eklendi. v9 kayıtları açıldığında şehir eksik liseleri/klinikleri otomatik alır.

v9 (1.2.0, Save 3.0) ile kayda `p9` bölümü eklendi: chunk verisi, bölge istatistikleri, komşu şehirler, haneler, trafik (kavşak ayarları, olaylar), toplu taşıma hatları, şebeke/su/kanalizasyon durumu, çevre (rüzgâr, toprak hafızası), aktif afetler, hava, zaman çizelgesi + şehir tarihçesi, meydan okumalar ve timeline dalı. Binalara `cond` (durum) ve inşaat projesi (`cp`: işçi + malzeme) eklendi. Eski kayıtlar açıldığında şehir otomatik olarak Part 9 ağlarını (trafo merkezi, arıtma tesisi, pompa) alır.

v8 (1.1.0) ile kayda `p8` bölümü eklendi: üretilen dünyanın profili (seed, preset, harita tipi, nüfus, bina ve ilçe sayısı, ilçe adları, ekonomi, iklim, üretici sürümü), özel şirketler ve pazar payı hedefleri.

**Migration:** `save.js` içindeki `MIGRATIONS` tablosu v1 → v2 → … → v10 adım adım çalışır. 1.2.0 `{ from: 8, to: 9 }`, 1.3.0 `{ from: 9, to: 10 }` adımını ekledi; gelecek sürümler yine yalnızca yeni bir adım ekler; eski kayıtlar otomatik yükseltilir. Daha yeni bir sürümün kaydı açılmaya çalışılırsa oyun bunu reddeder ve mevcut kaydı bozmaz.

### Eski tarayıcı kayıtlarını aktarma (IMPORT OLD BROWSER SAVE)

Tarayıcı kayıtları tarayıcının içinde (localStorage) durduğu için EXE onları doğrudan okuyamaz. Bir kez aktarın:

1. Oyunu eskisi gibi Chrome/Edge'de açın. Eski `index.html` de olur, yeni `src/index.html` de; Chrome'da ikisi aynı tarayıcı kayıtlarını görür.
2. **Yeni `src/index.html`:** Ayarlar → **📦 Export all saves**. Tüm şehirler ve profil tek bir dosyaya yazılır.
   **Eski `index.html`:** Ayarlar → **⬇️ Download .json**. Her şehir ayrı bir dosyaya indirilir.
3. EXE'yi açın. Hiç kayıt yoksa ilk açılışta **IMPORT OLD BROWSER SAVE** penceresi gelir. Ya da ana menüden **📦 Import old browser save** ile dosyayı seçin.
   Şehirler boş yuvalara yerleşir; mevcut şehirlerin üzerine yazılmaz.

## 6. Kısayollar

| Tuş | İşlev |
|---|---|
| 1–9, + / − | Simülasyon hızı (duraklat … 100×) |
| P / Boşluk | Duraklat / devam |
| ESC | Açık pencereyi kapatır; hiçbir şey açık değilse oyunu duraklatıp duraklatma menüsünü açar |
| N | Heatmap seçici |
| G | İstatistik merkezi |
| F3 | Debug paneli (FPS, frame time, entity/vatandaş/araç/bina sayıları, simülasyon tick'i, aktif olaylar, pathfinding) |
| Ctrl+K | Komut paleti |
| Ctrl+Shift+P | Command Palette 2.0 (Generate World, Repair World, Snapshot, Clone, Disaster, Clear Traffic, Unlock, Mega Project, Economy, Citizen Analytics) |
| J | Living City hub (haberler, şirketler, eğitim/sağlık, turizm, ulaşım, şoklar, Project Manager, altyapı, olaylar, dilekçeler, hedefler, AI Assistant, What-If, otomasyon, grafikler) |
| U | Tam ekran CITY DASHBOARD (Esc kapatır) |
| O | WORLD OBSERVATORY (tüm harita, 13 görünüm) |
| Ctrl+S | Kaydet |
| F11 | Tam ekran ⇄ pencere |
| F12 | Ekran görüntüsü → Resimler\BLOCK CITY TYCOON |
| Shift+M | Mini harita (M zaten dünya haritası olduğu için Shift+M seçildi) |
| F | Fotoğraf modu (UI gizleme, eğim, zoom, döndürme, serbest kamera) |
| B / C / R / Q / T / X / Z / L / D / H / M | Build / City / Research / Quests / Roads / Bulldoze / Zone / Layers / Dashboard / Advisor / World map |

Geliştirici modunda (`npm run dev`) Ctrl+Shift+I DevTools'u açar. EXE'de DevTools, menü çubuğu ve yeniden yükleme kısayolları kapalıdır.


## 6b. Admin paneli ve tek tık dünya üretici (1.1.0)

Admin paneli normal oyuncudan gizlidir.

| Kısayol | İşlev |
|---|---|
| **F10** | World Control Center / Admin Kontrol Merkezi (aç / kapat) — 1.2.0'dan itibaren önce **ADMIN MODE** açılmalı |
| **Ctrl+Alt+F10** | Admin modunu onayla açar (ayarlara girmeden) |
| **Ctrl+F10** | Doğrudan dünya üretici (WORLD kategorisi) |
| **Ctrl+Shift+F10** | World Debugger (harita üstünde sorunlar) |
| Ctrl+Shift+A | Admin paneli (eski kısayol) |

Ana menüdeki **🛡️ ADMIN** düğmesi ancak F10 bir kez kullanıldıktan sonra görünür; başlıktaki sürüm yazısına 5 kez tıklamak da onu gösterir. Panel açıkken simülasyon durur (⚙ SYSTEM'den değiştirilebilir). **🚪 EXIT ADMIN MODE** bedava inşaat, anında inşaat, oturumluk kilit açma ve debugger'ı kapatır; normal oyun eski haline döner.

**Kategoriler:** 🌍 World · 🗺 Map · 🏙 City · 🏗 Buildings · 🛣 Roads · 👥 Citizens · 🚗 Traffic · 💰 Economy · 🏢 Companies · ⚡ Utilities · 🌳 Environment · 🌦 Weather · 🚨 Events · 🔬 Technology · 📋 Quests · 🤖 AI · 🎮 Simulation · 💾 Save · 🐞 Debug · ⚙ System. Üstte büyük düğmeler: **🌍 GENERATE LIVEABLE WORLD**, **🔧 FIX WORLD**, **🔓 UNLOCK EVERYTHING**, **🏙️ MAX CITY**. Arama kutusu komut, bina, vatandaş, şirket ve ilçe arar. Altta komut konsolu vardır.

**🌍 GENERATE COMPLETE WORLD** sırasıyla şunları yapar ve ilerleme ekranında her adımı yüzdeyle gösterir:

Terrain → Water → Roads → Districts → Zoning → Utilities → Buildings → Businesses → Citizens → Jobs → Transport → Emergency services → Economy → Traffic → AI → World validation → Auto fix → Start simulation.

- **Arazi:** ovalar, tepeler, dağlar, nehirler, göller ve kıyılar. Çok dik (kaya) alanlar inşaata kapalıdır.
- **Yollar:** otoyol → ana yol → orta yol → sokak hiyerarşisi. Köprü ve tünel yalnızca ana ağda kullanılır. Büyük haritalarda çevre yolu vardır. Kopuk parçalar otomatik bağlanır.
- **İlçeler:** isimli ilçeler (ör. *Downtown, Riverside Gardens, Harbor Point, Iron Works, Oak Tech Valley*). Merkezde Downtown, su kenarında turizm ve lüks, kaynakların yanında sanayi, kenarlarda banliyö.
- **Hizmetler:** polis, itfaiye, hastane ve okul önce ağ şeklinde yerleşir, sonra kapsama kontrol edilip tamamlanır.
- **Konut ve iş:** konutlar, işletmeler (talebe göre boyutlanır), üretim zincirleri (çiftlik → buğday → değirmen → fırın, maden → metal → elektronik), depolar ve rakip şirket sahipliği.
- **Ulaşım:** otobüs, metro, tren, havaalanı ve liman (harita boyutuna göre).
- **Altyapı ve ekonomi:** elektrik, su ve atık gerçek talebe göre kurulur. Konut ile iş dengelenir (şehir dolunca işsizlik %5 civarında). Başlangıç parası, vergi ve stoklar hazırlanır, ekonomi kısa bir süre simüle edilir.

Sonuç ekranı nüfus, bina, yol, şirket, araç ve ilçe sayılarını, **WORLD HEALTH** puanını ve **WORLD VALIDATION** listesini gösterir.

- **12 hazır dünya:** Balanced, Mega City, Green, Industrial, Tourist, Financial, Smart City, Dense Metropolis, Mountain, Island, Coastal, Winter.
- **Custom World:** harita boyutu, arazi, su, dağ, nehir, orman, yol, bina, nüfus, sanayi, turizm, trafik, başlangıç altyapısı, ekonomi gücü, afet sıklığı, hava ve iklim.
- **Harita boyutları:** SMALL 40, MEDIUM 52, LARGE 64, HUGE 80, MEGA 96, GIGA 128. 80 ve üzerinde uyarlanabilir performans otomatik açılır.
- **Seed:** aynı `CITY-xxxxxx` seed, aynı ayarlar ve aynı üretici sürümüyle aynı başlangıç dünyasını (yollar, imar, binalar, seviyeler) üretir.

**Doğrulama ve onarım:**
- **World Validator** şunları kontrol eder: yollar, konut bağlantısı, elektrik, su, kanalizasyon/atık, hastane, okul, iş, gıda, ticaret, acil servis, trafik ağı, ev, istihdam, ekonomi.
- **FIX WORLD** şunları onarır: kopuk binalara erişim yolu açar, yol adalarını birbirine bağlar, sıkışmış binaları taşır, elektrik/su/atık kapasitesi ekler, hizmet kapsamasını tamamlar, konut ve iş yeri ekler, gıda ve dükkân ekler, tedarik zinciri boşluklarını kapatır, bozuk şirket kayıtlarını onarır, bozuk rotaları ve vatandaşları temizler.

**Snapshot ve rollback:**
- `snapshot_001 …` oluşturulur; geri dönmeden önce onay istenir ve otomatik bir güvenlik snapshot'ı alınır.
- Admin ön ayarları kaydedilebilir. Hazır olanlar: Mega City Test, Economic Crisis Test, Traffic Stress Test, Population Stress Test, Disaster Test.

**Test araçları:**
- **⚡ STRESS TEST:** önce snapshot alır. NPC ve trafik yoğunluğunu %200'e, simüle nüfusu 100.000'e çıkarır ve 10 saniye 10× hızda ölçer. Uzak vatandaşlar istatistiksel simülasyonda kalır. Sonunda her şey geri yüklenir.
- **SIMULATION BENCHMARK:** FPS, TPS, vatandaş/trafik/ekonomi güncelleme süresi, renderer süresi ve bellek.

**Komut konsolu** (bilinmeyen komut veya hatalı argüman oyunu bozmaz, hata olarak gösterilir):

```
help · giveMoney 1000000 · setMoney · giveBudget · unlockAll · maxCity · spawnCitizens 10000 · setPopulation
setHappiness · setWeather rain · setTime 18 · setDay · setSeason winter · setTax · setInterest · setInflation
clearTraffic · spawnTraffic 40 · generateWorld megacity HUGE CITY-123456 · fixWorld · validate · health
snapshot [ad] · rollback 001 · startDisaster earthquake · startCrisis power · disableEvents on
unlockTech · generateQuest 5 · completeQuest · speed 10 · freeBuild on · instantBuild on · debugWorld on
benchmark · stressTest · duplicateWorld · marketBoom · marketCrash · clear
```

Her admin işlemi `logs\admin.log` dosyasına yazılır (ör. `[16:21] Admin: Generated world …`). Tarayıcı sürümünde son 300 satır tarayıcı depolamasında tutulur.

## 6c. World Engine ve World Control Center (1.2.0)

**Admin güvenliği:** admin paneli normal oyuncuya yanlışlıkla açılmaz. ⚙️ Ayarlar → **🛡️ ENABLE ADMIN MODE** ya da **Ctrl+Alt+F10** (onay penceresiyle) açıldıktan sonra **F10** çalışır. Kapalıyken F10 yalnızca bir ipucu gösterir.

**Devasa dünya (chunk motoru):**
- Harita 16×16 karolu **chunk**'lara ve **bölgelere** (Central / North / South / East / West) bölünür. Yeni boyut **GIGA 128×128**; **CREATE NEW REGION** dünyaya her seferinde 16 karoluk bir halka ekler (en fazla 160×160). Nehirler, yollar ve arazi yeni bölgeye kesintisiz devam eder.
- **Zemin akışı (streaming):** her chunk'ın zemin görüntüsü kamera yaklaşınca yüklenir, harita değişince birkaç chunk/kare hızında yenilenir, uzun süre kullanılmayınca veya bellek bütçesi aşılınca bırakılır. Görüş alanının etrafındaki halka önceden yüklenir, sınır görünmez. Çözünürlük zoom'a göre değişir (LOD).
- **Simülasyon katmanları:** NEAR (görünen chunk'lar, tam ajan simülasyonu) · MID (çevresi, azaltılmış) · FAR (istatistiksel: ajanlar seyrek güncellenir, uzak trafik tıkanıklık alanında toplanır). Ekonomi ve şehir istatistikleri her zaman tüm dünyayı kapsar.
- **Bölge istatistikleri:** nüfus, iş, konut, trafik, arazi değeri, mutluluk, eğitim, sağlık, enerji, su, üretim, ticaret, turizm.
- **Komşu şehirler:** METRO CITY, RIVER CITY, INDUSTRIAL CITY, COASTAL CITY, TECH CITY, OLD TOWN ekonomik olarak simüle edilir (nüfus, GSYH, ilişki). Harita kenarındaki gerçek yol / tren / liman / havaalanı bağlantılarına göre yolcu (iş için gelen-giden), turist, ihracat-ithalat, kargo kamyonları, hammadde ve enerji akar. Haritanın dışında silüetleri ve otoyol bağlantıları görünür.

**Trafik 2.0:** şerit sistemi (küçük 2 · orta 4 · büyük 6 · otoyol 8 şerit), şerit değiştirme (önündeki araç, hız, dönüş öncesi doğru şerit). Kavşaklar: trafik ışığı (korumalı sol dönüş ve yaya fazı), göbekli kavşak, ana yol önceliği, dört yönlü dur. **TRAFFIC LIGHT AI** yeşil süreleri kuyruklara göre ayarlar; acil durum araçları ışıkları kendi yönlerine çevirir. **Traffic AI 2.0** her yolculukta ana yolu alternatifle (en hızlı / en az trafik / en kısa / en ucuz) canlı tıkanıklıkla karşılaştırır. **Trafik olayları** (kaza, yol çalışması, kapalı yol, sel, arıza) yolu kapatır ve etkilenen her araç anında yeniden rotalanır.

**Toplu taşıma ağı (STOP → LINE → ROUTE → VEHICLE → PASSENGER):** Otobüs, Tramvay (yeni Tram Stop), Metro, Tren, Feribot (yeni Ferry Pier) ve Havaalanı Servisi. Hatlar duraklardan otomatik kurulur veya elle eklenir. Vatandaşlar evden durağa yürür, bekler, biner, hedefe en yakın durakta iner ve yürür.

**Şehir yaşamı:** **Haneler** (ev, üyeler, gelir, gider, iş yerleri, ulaşım, ihtiyaçlar, memnuniyet; gençler hafta içi okula gider). **Emlak piyasası:** her karonun arazi değeri ulaşım, hizmet, güvenlik, çevre, eğitim, iş olanakları, turizm ve talebe göre değişir; kira, bina değeri (emlak vergisi), arsa fiyatı ve yatırımcıların nereye inşa ettiği buna bağlıdır. **Construction 2.0:** inşaat projesi (bütçe, işçi, çelik/beton/cam) TEMEL → İSKELET → DIŞ CEPHE → İÇ YAPI → TAMAMLANDI aşamalarıyla görünür; malzeme yoksa ithal edilir, işçi azsa yavaşlar; INSTANT BUILD atlar. **Bakım:** her binanın CONDITION değeri (Excellent → Critical) zamanla düşer; düşük durum verimi, değeri ve hizmet kalitesini azaltır, arıza ihtimalini artırır; bakım şirketleri depolardan ekip gönderir.

**Altyapı 2.0:** güç şebekesi **Santral → Trafo merkezi (yeni Substation) → Trafo (her ilçe) → İlçe → Bina**: üretim / tüketim / rezerv MW cinsinden; trafo veya trafo merkezi kapasitesi aşılırsa **OVERLOAD** ve kesinti. Su ağı: rezervuar (yeni), su tesisi, pompa istasyonu (yeni), yollar boyunca ana borular ve **basınç**; boru patlarsa akış aşağısında basınç düşer, bakım ekibi gider. **Kanalizasyon:** bina → kanal → ilçe borusu → arıtma tesisi (yeni); kapasite aşılırsa **SEWAGE OVERLOAD**.

**Çevre ve hava:** kirlilik rüzgâr yönüyle komşu ilçelere yayılır. Yeni ısı haritaları: Gürültü, Hava Kalitesi, Su Kalitesi, Toprak Kalitesi, Turizm, Kanalizasyon, Acil Durum Kapsaması, Bina Durumu (kirlilik/elektrik/su haritaları artık yeni ağları gösterir). **Weather 2.0:** Güneşli, Bulutlu, Yağmur, Sağanak, Fırtına, Sis, Kar, Sıcak Hava Dalgası, Soğuk Hava Dalgası — trafik, enerji, su, vatandaş davranışı, turizm, tarım ve afet riski (sel, don ile boru patlaması, sıcakta yangın, fırtınada trafo arızası) üzerinde etkili.

**WORLD CONTROL CENTER (F10):** üstte sürekli **WORLD HEALTH** (Roads, Utilities, Economy, Citizens, Traffic, Environment, Emergency; yeşil/sarı/kırmızı) ve 16 büyük hızlı eylem: GENERATE WORLD, REPAIR WORLD, MAX CITY, UNLOCK EVERYTHING, BUILD ALL UTILITIES, FIX TRAFFIC, FIX ECONOMY, REPAIR ALL, CLEAR DISASTERS, MAX HAPPINESS, CLEAR POLLUTION, FILL TREASURY, SPAWN MEGACITY, CREATE NEW REGION, CLONE WORLD, CREATE SNAPSHOT.

| Sekme | İçerik |
|---|---|
| WORLD | seed, boyut, iklim, arazi, su, dağ, orman, kaynaklar; chunk haritası (NEAR/MID/FAR), bölge tablosu, komşu şehirler |
| SIMULATION | duraklat, hız, Freeze Economy / Traffic / Citizens / Weather / Buildings |
| ECONOMY | para, enflasyon, faiz, talep, fiyat seviyesi, şirket büyümesi, emlak piyasası |
| CITIZENS | nüfus, mutluluk, iş, gelir, ihtiyaçlar, göç; haneler |
| TRAFFIC | trafik üret/temizle, çarpan, tıkanıklık, kaza üretici, TRAFFIC LIGHT AI, rota modu, olaylar, toplu taşıma hatları, Emergency AI kaydı |
| WORLD EVENTS | afetler (komuta merkezi), festival, ekonomik patlama, resesyon, turizm patlaması, tedarik krizi, hava |
| BUILDINGS | unlock all, instant build, max upgrade, repair all, destroy selected, bakım, inşaat projeleri |
| UTILITIES | infinite power / water, repair grid, overload grid (test), fix sewage |
| DEBUG | Entity Inspector, FPS, frame/render/simülasyon süresi, bellek, chunk ve AI sayıları, Validator 2.0 (sürekli) + AUTO FIX |
| INSPECTOR · WORLD BRUSH · REGIONS · DISASTER CMD · SNAPSHOTS 2.0 · TIMELINE · CHALLENGES · ADVISOR 2.0 | aşağıda |

- **Entity Inspector:** vatandaş, araç, bina, şirket, yol, altyapı veya ilçe seçilir; sağda canlı güncellenen panel açılır (ör. vatandaş: ID, yaş, iş, gelir, ev, iş yeri, hane, ihtiyaçlar, mutluluk, konum, şu anki etkinlik). Yolda kavşak tipi değiştirilebilir, yol kapatılabilir.
- **World Brush:** Build, Destroy, Upgrade, Repair, Road, Zone, Park, Water, Forest, Terrain, Pollution, Land Value; boyut 1 / 5 / 10 / 25 / 50 / 100.
- **Region Selector:** haritada dikdörtgen seç → Upgrade All Roads, Repair All Buildings, Build Utilities, Increase Land Value, Add Trees, Remove Pollution.
- **Disaster Command Center:** Earthquake, Flood, Storm, Fire, Power Failure, Water Failure, Infrastructure Collapse; konum (haritadan seçilebilir), şiddet, süre, yarıçap ve yayılma. Emergency AI 2.0 en uygun birimi mesafe, trafik, yol durumu, istasyon kapasitesi ve önceliğe göre seçer. Önce/sonra otomatik snapshot alınır.
- **Snapshot 2.0 + dallanma + klonlama:** adlı snapshot'lar (Before Disaster, After Disaster, Mega City Stage …); bir snapshot'tan alternatif dünya (ör. "Flood Avoided") başka bir slota bağımsız kayıt olarak yazılır ve zaman çizelgesi ağacında görünür. **CLONE WORLD** şehri başka slota bağımsız kopyalar.
- **Timeline ve City History:** şehir kuruluşu, nüfus eşikleri, ilk otoyol, ilk metro hattı, büyük binalar, büyük afetler, Megacity Era, sanayi büyümesi, turizm rekorları otomatik yazılır ve kayda dahil edilir.
- **World Achievements 2.0:** World Builder, City Master, Megacity, Traffic Master, Economy Master, Green City, Industrial Power, Tourism Capital, Tech Capital, Zero Blackout, Zero Water Shortage, 100% Road Connectivity, 1 / 10 / 100 Million Citizens.
- **World Challenge Generator:** OBJECTIVE / CONDITION / TIME LIMIT / REWARD (ör. "Reach 64,000 citizens without building a new highway", "Maintain 90% happiness for 6 years", "Survive three disasters", "Become the richest region", "Build a zero-pollution city").
- **Validator 2.0 (sürekli):** yollar, erişim, elektrik, su, kanalizasyon, iş, konut, gıda, acil durum, trafik rotaları, tedarik zincirleri, ekonomi dengesi, vatandaş yol bulma ve chunk bağlantıları; **AUTO FIX** trafo merkezi, arıtma, pompa, tedarik zinciri ve rota onarımları ekler.
- **Smart Advisor 2.0:** sorunu analiz eder → NEDEN → ÇÖZÜM → TAHMİNİ MALİYET → BEKLENEN SONUÇ, **APPLY SOLUTION** ile uygular (Ctrl+K → "Smart Advisor 2.0", oyuncular için de açık).

**F3 performans monitörü** artık simülasyon/render süresini, vatandaş/araç/bina sayısını, aktif ve yüklü chunk'ları, AI ve pathfinding görevlerini ve belleği de gösterir.

**Otomatik EXE testi:** `"BLOCK CITY TYCOON.exe" --selftest --selftest-out=rapor.json` 30 adımı çalıştırır (New City, Generate Liveable World, Validator, Auto Fix, Start, 1× / 10× / 100×, trafik, ekonomi, afet, acil durum, Save, **EXE'yi yeniden başlatma**, Load, Snapshot, Clone World, Admin Panel, chunk streaming, performans; 1.3.0 ile Living World, Company AI 2.0 & Stock Market 2.0, eğitim/sağlık, turizm/ulaşım/lojistik, tedarik şoku, megaproje, Incident Center, Simulation Lab/What-If/Time Machine, Living City UI ve GENERATE MEGA WORLD), ayrı bir geçici kullanıcı klasörü kullanır, `logs\selftest.json` yazar ve 0 / 1 çıkış koduyla kapanır. Windows Release iş akışı bunu her derlemede yeni EXE üzerinde çalıştırır ve raporu sürüme ekler. Tarayıcıda: `index.html?selftest`.

## 6d. Living World, gelişmiş ekonomi ve Advanced Simulation (1.3.0)

Şehir artık oyuncu hiçbir şey yapmasa da kendi kendine yaşar. Bütün sonuçlar gerçek oyun verilerinden hesaplanır ve mevcut ekonomi / vatandaş / trafik / altyapı sistemlerine bağlıdır.

- **Living World Engine:** yeni şirketler kurulur (karşılanmayan talep, itibar), şirketler büyür/küçülür, mağaza açar/kapatır, bakımsız ve zarar eden binalar kapanır, vatandaşlar daha iyi maaşlı işlere geçer, kirası yükselen haneler taşınır (bölgeler arası göç), yeni mahalleler oluşur; arazi fiyatları, trafik, turizm ve ticaret günlük olarak izlenir.
- **Şehir yaşam döngüsü:** Sabah / Öğle / Akşam / Gece / Hafta sonu fazları; 24 saat çalışan iş yerlerinde **gece vardiyası**, hafta sonu turistik yerler. Hub'da anlık etkinlik dağılımı gösterilir.
- **Dinamik nüfus:** doğum, ölüm (sağlık erişimi, kirlilik), göç (iş, konut fiyatı, eğitim, mutluluk, işsizlik, itibar) — **MIGRATION IN / MIGRATION OUT** haberleri, yıllık nüfus tablosu.
- **Eğitim hattı:** İlkokul → **Lise** → **Kolej** → Üniversite → Araştırma Merkezi; zincirleme kapsama, işgücü eğitim dağılımı; eğitim → beceri → nitelikli iş verimi → gelir → vergi/ekonomi.
- **Araştırma alanları:** AI, Medicine, Engineering, Energy, Environment, Economics (üniversite örn. AI +12, Medicine +8, Engineering +20 / gün); seviyeler gerçek bonus verir, Research Center teknoloji ağacına RP ekler.
- **Hastane sistemi:** **Klinik, Hastane, Medical Center, University Hospital** — yatak, acil yatak, personel, tedavi verimi, erişim; **HEALTHCARE OVERLOAD** (bekleme süresi, mutluluk düşüşü); gerçek ambulans rotası vatandaş → ambulans → hastane. Admin: **HEAL ALL CITIZENS**, **MAX HEALTHCARE**.
- **Tourism 2.0:** turistler karayolu, tren, havaalanı, deniz/kruvaziyer ve komşu şehirlerden gelir (her yolun gerçek kapasitesi); otel/restoran/alışveriş/cazibe/eğlence harcaması; yeni cazibe merkezleri **Landmark Monument, Aquarium, Observation Tower, Convention Center, Beach Resort, Historic District** (+ müze, stadyum, tema parkı) — her birinin TOURISM VALUE'su.
- **Havaalanı lojistik merkezi:** yolcu, kargo, uçuş, iş; **AIRPORT CONGESTION**; yeni **Airport Terminal**. **Liman:** TEU kapasitesi, ithalat/ihracat, gemiler, **Container Terminal**, **Cruise Terminal**. **Demiryolu:** çelik, tahıl, elektronik, sanayi ürünü yükü, **Rail Hub**. **Lojistik ağı:** fabrika → depo → kamyon/tren/gemi → **Distribution Center** → mağaza → müşteri (mesafe, trafik, yakıt, gecikme, kapasite, darboğaz).
- **Tedarik şokları:** STEEL / GRAIN / CHIP / CONCRETE SHORTAGE, FUEL CRISIS — fiyat artışı (örn. çelik +%35, elektronik +%12, inşaat +%18) gerçek piyasa fiyatlarına ve bina maliyetlerine yansır; çözümler: yerli üretim, ithalat, yeni fabrika, alternatif kaynak.
- **Company AI 2.0 + rekabet:** genişleme, bölgeye giriş, kendi fabrikası, kredi, fiyat savaşı, premium, işe alım/işten çıkarma, ürün geliştirme; fiyat · kalite · konum · pazarlama · itibar tablosu. **Dinamik markalar:** CITY MART → CITY MART GROUP → HOLDINGS → GLOBAL; iflastan sonra yeni şirket doğar.
- **Stock Market 2.0:** değer = gelir, kâr, büyüme, borç, itibar, pazar payı + haber etkisi (örn. "… opens 5 new stores" → hisse +%).
- **City News:** gerçek verilerden manşetler; haberlerin gerçek etkileri (turizm, talep, üretim, hisse) ve "Major Factory Opens" gibi haberlerde 60 sn sonra **ölçülen** etki (iş, trafik, kirlilik, üretim).
- **City Reputation 0–1000**, **yıllık World City Ranking** (Economy, Tourism, Education, Healthcare, Green City, Transport, Quality of Life), **bölgesel rekabet** (GDP, nüfus, mutluluk, turizm, eğitim, güvenlik, çevre).
- **Dinamik arazi gelişimi:** boş arazi → küçük → orta → yüksek bina → megaproje; **AUTO DEVELOPMENT** kapatılabilir.
- **Megaprojeler:** Mega Airport, Central Railway Hub, Arcology Prime, Super Stadium, Financial Tower, Space Center, Mega Port, Mega Tech Campus, Grand Park — para, zaman, işçi, malzeme (çelik/beton/cam); %0 Planning · %25 Foundation · %50 Structure · %75 Exterior · %100 Complete görsel aşamaları; **PROJECT MANAGER**.
- **Bakım bütçeleri** (yollar, binalar, enerji, su, raylı sistem) ve **altyapı yaşlanması** (köprüler, yol ağları, tesisler): REPAIR / UPGRADE / REPLACE.
- **Rastgele olaylar + INCIDENT CENTER:** araç arızası, küçük kaza, altyapı arızası, inşaat gecikmesi, depo sorunu, trafik olayı — gerçek acil araçlar, müdahale süresi, etkilenen ilçe.
- **Vatandaş görüşleri ve dilekçeler** (ACCEPT / IGNORE), **uzun vadeli hedefler** (1M nüfus, #1 turizm, %95 mutluluk, 5 metro hattı, $1B GDP …), **dinamik görevler**.
- **Akıllı otomasyon:** AUTO TRAFFIC, AUTO PUBLIC TRANSPORT, AUTO BUILD, AUTO REPAIR, AUTO ECONOMY, AUTO ZONING, AUTO EMERGENCY, AUTO UTILITY BALANCE, AUTO DEVELOPMENT (bütçeden ödenir).
- **City AI Assistant:** PROBLEM → NEDEN → SEÇENEKLER (maliyetli) → BEKLENEN SONUÇ (motor tarafından hesaplanır).
- **WORLD OBSERVATORY** (O), **canlı grafikler** (13 seri), tam ekran **CITY DASHBOARD** (U).
- **Admin (World Control Center):** LIVING WORLD, INCIDENT CENTER, **SIMULATION LAB** (nüfus/trafik/vergi/sanayi/turizm deneyi — gerçek motor, dünyanın kopyasında), **WHAT-IF** (APPLY / DISCARD), **TIME MACHINE** (Yıl 1/5/10/25/50/100), **WORLD FACTORY** + **World Presets 2.0** (13 yeni preset), **GENERATE MEGA WORLD** (22 adım) + **WORLD GENERATION SCORE** ve AUTO FIX, MEGAPROJECTS, HEALTH & EDUCATION; admin arama 2.0 (örn. "traffic").

## 7. Pencere ve ayarlar

- Başlangıç 1280×720, en küçük 1024×600; yeniden boyutlandırma, büyütme, küçültme, tam ekran.
- **Ayarlar → 🖥️ Desktop & system:** Resolution (1024×600 … 2560×1440), pencere modu (Windowed / Fullscreen / Borderless), Master volume, Particles (ON / REDUCED / OFF), Shadows, NPC density, Traffic density, Autosave ve aralığı, Language (English / Türkçe), odak kaybında duraklatma, klasör kısayolları, tüm kayıtları dışa aktarma ve eski kayıt içe aktarma. Müzik, SFX ve grafik kalitesi mevcut ayarlardan gelir ve settings.json'a da yazılır.
- Language ayarı masaüstü kabuğunu (yükleme ekranı, sistem pencereleri, bu bölüm) çevirir; oyunun kendisi İngilizcedir.
- Borderless modu pencere çerçevesi değiştiği için yeniden başlatmada uygulanır (**↻ Save & restart**).
- **Alt+Tab:** simülasyon arka planda da devam eder (arka plan kısıtlaması kapalı); odak dönüşünde ses devam eder, sürüklemeler temizlenir, kamera ve canvas yeniden ölçülür. İsterseniz "Pause when the window loses focus" açılabilir.
- **Çıkış:** X veya Alt+F4 → şehir otomatik kaydedilir → *EXIT BLOCK CITY TYCOON? Your city has been automatically saved. [EXIT] [CANCEL]*.
- **Çökme kurtarma:** oyun beklenmedik kapanırsa sonraki açılışta *PREVIOUS SESSION RECOVERY — [RECOVER] [LOAD LAST SAVE] [DISCARD]* gelir. Renderer çökerse veya donarsa pencere yeniden yüklenir ve aynı seçenekler sunulur.
- **Hata toleransı:** bozulan bir vatandaş evinde güvenli duruma getirilir (onarılamazsa kaldırılır). Bozulan bir rakip şirket verisi güvenli değerlerle yeniden kurulur; binaları ve oyuncunun hisseleri korunur. Bir sistemde hata olursa yalnızca o sistem onarılır, oyun devam eder. Tüm bunlar `latest.log`'a yazılır.

## 8. Güncelleme altyapısı

`electron/updater.js` dört adımı içerir: **Update Checker → Version Check → Download Update → Install Update**. Açmak için `package.json` içindeki `bctUpdate.manifestUrl` alanına https ile yayınlanan bir JSON adresi yazın:

```json
{ "version": "1.3.0", "url": "https://example.com/BLOCK-CITY-TYCOON-Setup-1.3.0.exe", "sha256": "…", "notes": "Yeni binalar" }
```

Adres boşsa güncelleme kapalıdır. İnternet yoksa oyun sessizce devam eder. İndirilen installer'ın SHA-256 değeri doğrulanır. Kayıtlar kullanıcı klasöründe durduğu için güncellemeden etkilenmez.

## 9. Tarayıcıda oynamak (isteğe bağlı)

`src/index.html` dosyası Chrome/Edge'de doğrudan da açılabilir. Tarayıcıda kayıtlar localStorage'da tutulur; dosya dialogları yerine indirme ve dosya seçici kullanılır.

## 10. Test planı

Bu sürümde otomatik olarak (Linux üzerinde Electron + Playwright, Xvfb ile) doğrulananlar:

| # | Test | Sonuç |
|---|---|---|
| 1–5 | New City · Continue · Save (Ctrl+S) · Load · Autosave | ✅ `saves/city_01.json` + `.backup.json` oluşuyor, kapat → aç → CONTINUE şehri geri getiriyor |
| 6–7 | JSON Export / Import (native dialog) | ✅ dışa aktarma, tek şehir ve toplu (bundle) içe aktarma |
| 8–11 | Heatmap · Statistics · Debug · Simülasyon hızı | ✅ Part 6 testleri (heatmap'ler, 100× hız, istatistik, F3) yeni dosya yapısında hatasız |
| 12–16 | Trafik · Ekonomi · Şirketler · Teknoloji · Afet | ✅ sistem testleri hatasız; v4/v5/v6 → v7 migration |
| 17 | Photo mode + F12 | ✅ PNG `Resimler\BLOCK CITY TYCOON` altına kaydediliyor |
| 18 | Fullscreen (F11) | ✅ açılıyor ve kapanıyor |
| 19 | Alt+Tab (blur/focus) | ✅ simülasyon devam ediyor, hata yok |
| 20 | Close / Reopen | ✅ çıkış penceresi, CANCEL / EXIT, session.lock temizleniyor |
| 21 | Crash Recovery | ✅ süreç öldürülünce ve renderer çökünce kurtarma penceresi geliyor, RECOVER / LOAD LAST SAVE çalışıyor |
| 22 | EXE (paketlenmiş app.asar) | ✅ paketli uygulama açılıyor, DevTools kapalı, kaydet → kapat → aç → devam |
| 23 | Installer | ✅ NSIS installer oluşturuluyor. Wine altında klasör sayfası (`C:\Program Files\Block City Tycoon`), "Create Desktop Shortcut" sayfası, dosyalar, masaüstü ve Başlat Menüsü kısayolları, Yüklü uygulamalar kaydı doğrulandı |
| 25 | Dünya üretici (12 preset + custom, SMALL…MEGA) | ✅ hepsi LIVEABLE, sağlık %92–98, 1–4 sn, simülasyon dakikalarca kararlı |
| 26 | Admin paneli, konsol, snapshot/rollback, stres testi, benchmark, export/import, admin.log | ✅ tarayıcıda ve Electron'da hatasız |
| 27 | Part 9: chunk motoru, trafik 2.0, toplu taşıma, haneler, emlak, inşaat 2.0, bakım, şebeke/su/kanalizasyon, çevre, Weather 2.0, World Control Center, inspector, fırça, bölge seçici, afet komuta merkezi, snapshot 2.0/dallanma/klon, timeline, meydan okumalar, Validator 2.0, Advisor 2.0 | ✅ tarayıcıda hatasız; GIGA 128×128 dünya 3 sn'de üretiliyor |
| 28 | Otomatik self-test (30 adım, EXE yeniden başlatma dahil) | ✅ tarayıcıda ve Electron'da 30/30 |
| 29 | Part 10: Living World, yaşam döngüsü, nüfus, Company AI 2.0, markalar, Stock Market 2.0, haberler, itibar, sıralama, eğitim/araştırma/sağlık, Tourism 2.0, havaalanı/liman/demiryolu/lojistik, şoklar, megaprojeler, bakım/yaşlanma, olaylar, dilekçeler, hedefler, otomasyon, Assistant, Observatory, grafikler, Time Machine, Simulation Lab, What-If, World Factory, 22 adımlı GENERATE MEGA WORLD | ✅ tarayıcıda hatasız; v9 → v10 migration; aynı seed aynı dünya; GIGA mega dünya 7 sn, skor 94/100 |
| 24 | Uninstaller | ✅ Wine altında dosyalar, kısayollar ve kayıt defteri girdisi siliniyor, kayıtlar korunuyor |

Wine altında doğrulanamayanlar gerçek bir Windows PC'de denenmeli:

- Oyun penceresinin kendisi: Chromium'un çizim süreci wine'da başlamıyor.
- Installer'ın "oyun açık mı" kontrolü: bu kontrol PowerShell kullanıyor ve wine'da takılıyor. Kurulum/kaldırma testi bu kontrol geçici olarak kapatılmış bir test build'iyle yapıldı; gerçek build'de kontrol açık.

Windows'ta son kontrol:

```text
npm install → npm run dev → NEW CITY → şehir oluşur → Ctrl+S → pencereyi kapat (EXIT)
→ npm run build → dist\BLOCK-CITY-TYCOON-Setup-1.3.0.exe ile kur → masaüstü kısayolundan aç → CONTINUE → şehir geri gelir
```
