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
