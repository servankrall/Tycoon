# 🏙️ BLOCK CITY TYCOON
**Build. Manage. Expand.** — Windows masaüstü sürümü (64-bit, Windows 10/11)

## İndir
| Dosya | Ne için |
|---|---|
| **BLOCK-CITY-TYCOON-Setup-x.y.z.exe** | Kurulum sihirbazı: klasör seçimi (varsayılan `C:\Program Files\Block City Tycoon`), masaüstü kısayolu seçeneği, Başlat Menüsü kısayolu, Ayarlar → Uygulamalar'dan kaldırma |
| **BLOCK-CITY-TYCOON-Portable-x.y.z.exe** | Kurulumsuz: çift tıkla oyna; kayıtlar EXE'nin yanındaki `BLOCK CITY TYCOON Data` klasöründe |

> ⚠️ EXE dijital olarak imzalı değil. Windows ilk açılışta mavi bir uyarı gösterirse **Ek bilgi → Yine de çalıştır**'a basın.

## Nerede ne var (Windows + R)
- Kurulan oyun: `%ProgramFiles%\Block City Tycoon`
- Kayıtlar: `%APPDATA%\BLOCK CITY TYCOON\saves`
- Loglar: `%APPDATA%\BLOCK CITY TYCOON\logs`
- Ekran görüntüleri (F12): `shell:My Pictures` → `BLOCK CITY TYCOON`

## Eski tarayıcı kayıtları
Oyunu Chrome/Edge'de oynadıysanız: tarayıcıda Ayarlar → **📦 Export all saves** (veya **⬇️ Download .json**), sonra EXE'de **📦 Import old browser save** ile dosyayı seçin.

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
