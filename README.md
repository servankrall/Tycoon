# 🏙️ BLOCK CITY TYCOON — Windows Desktop Edition

**Build. Manage. Expand.** · Sürüm **1.0.0** · Kayıt formatı **v7**

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
├── BLOCK-CITY-TYCOON-Setup-1.0.0.exe      ← kurulum sihirbazı
├── BLOCK-CITY-TYCOON-Portable-1.0.0.exe   ← kurulumsuz, çift tıkla çalışır
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
├── profile.json                               oyuncu profili (unvanlar, rozetler, meydan okumalar)
├── logs\latest.log  (+ previous.log)
└── session.lock                               oyun açıkken var; temiz çıkışta silinir
```

- **Bozulmaya karşı:** her yazma önce `city_01.json.tmp` dosyasına yapılır, diske yazılır, geri okunup doğrulanır (JSON ayrıştırılır), ancak sonra `city_01.json` ile değiştirilir. Oyun ayrıca kayıttan önce durumu doğrular ve bir önceki kaydı `.backup.json` olarak saklar.
- **Otomatik kayıt:** varsayılan AÇIK, 30 saniyede bir (15 sn – 5 dk ayarlanabilir). Ayrıca büyük krizden önce, afet raporundan sonra, ana menüye dönerken ve çıkarken kaydeder.
- **Ekran görüntüleri:** `Resimler\BLOCK CITY TYCOON\` (F12 veya fotoğraf modundaki PNG dışa aktarma).
- **settings.json:** `resolution, fullscreen, borderless, music, sfx, masterVolume, graphics, particles, shadows, npcDensity, trafficDensity, autosave, autosaveInterval, language, pauseOnBlur`.

### Kayıt formatı (Save 2.0, v7)

Her kayıt `header` bölümü taşır: `saveVersion, gameVersion, timestamp, citySeed, cityName, slot, playSec, population` ve her bölümün JSON içindeki yeri (`player, economy, citizens, buildings, roads, vehicles, companies, stocks, research, quests, achievements, statistics, settings`). v7 ile yoldaki kamyon/tanker/çöp kamyonu/otobüsler kargo ve varış noktalarıyla birlikte kaydedilir.

**Migration:** `save.js` içindeki `MIGRATIONS` tablosu v1 → v2 → … → v7 adım adım çalışır. Gelecek sürümler (1.1.0, 1.2.0, 2.0.0) yalnızca yeni bir adım (`{ from: 7, to: 8, run: … }`) ekler; eski kayıtlar otomatik yükseltilir. Daha yeni bir sürümün kaydı açılmaya çalışılırsa oyun bunu reddeder ve mevcut kaydı bozmaz.

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
| Ctrl+S | Kaydet |
| F11 | Tam ekran ⇄ pencere |
| F12 | Ekran görüntüsü → Resimler\BLOCK CITY TYCOON |
| Shift+M | Mini harita (M zaten dünya haritası olduğu için Shift+M seçildi) |
| F | Fotoğraf modu (UI gizleme, eğim, zoom, döndürme, serbest kamera) |
| B / C / R / Q / T / X / Z / L / D / H / M | Build / City / Research / Quests / Roads / Bulldoze / Zone / Layers / Dashboard / Advisor / World map |

Geliştirici modunda (`npm run dev`) Ctrl+Shift+I DevTools'u açar. EXE'de DevTools, menü çubuğu ve yeniden yükleme kısayolları kapalıdır.

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
{ "version": "1.1.0", "url": "https://example.com/BLOCK-CITY-TYCOON-Setup-1.1.0.exe", "sha256": "…", "notes": "Yeni binalar" }
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
| 24 | Uninstaller | ✅ Wine altında dosyalar, kısayollar ve kayıt defteri girdisi siliniyor, kayıtlar korunuyor |

Wine altında doğrulanamayanlar gerçek bir Windows PC'de denenmeli:

- Oyun penceresinin kendisi: Chromium'un çizim süreci wine'da başlamıyor.
- Installer'ın "oyun açık mı" kontrolü: bu kontrol PowerShell kullanıyor ve wine'da takılıyor. Kurulum/kaldırma testi bu kontrol geçici olarak kapatılmış bir test build'iyle yapıldı; gerçek build'de kontrol açık.

Windows'ta son kontrol:

```text
npm install → npm run dev → NEW CITY → şehir oluşur → Ctrl+S → pencereyi kapat (EXIT)
→ npm run build → dist\BLOCK-CITY-TYCOON-Setup-1.0.0.exe ile kur → masaüstü kısayolundan aç → CONTINUE → şehir geri gelir
```
