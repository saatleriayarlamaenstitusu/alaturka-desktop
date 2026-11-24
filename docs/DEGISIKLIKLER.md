# Değişiklik günlüğü (mühendislik)

En yeni en üstte. Şablon için `alaturkavakitler/docs/DEGISIKLIKLER.md`.

## Devam eden

Yok.

---

### 2026-11-24 — Masaüstü takviminde resmî tatiller
**Ne:** Miladi ve Hicri görünümlerde Türkiye’nin sabit miladi tatilleri soluk mavi kareyle işaretleniyor. Seçili günün ayrıntısında tatil adı ve 28 Ekim için başlangıç saati görünüyor.
**Dosyalar:** src/ui/pages/calendar.js, src/lib/public-holidays.js, data/style.css, README.md
**Neden:** Miladi tatil aynı güne denk gelen dinî gün işaretiyle birlikte okunabilmeli. GJS kontrolünde 23 Nisan 2023 için iki işaret iki takvim görünümünde de görüldü.
**Etkisi:** Tatil listesi sitedeki listeyle eşleşir. Meson kurulumu yeni veri modülünü uygulamayla paketler.

### 2026-11-23 — Ajan belgeleri
**Ne:** `AGENTS.md` ve bu günlük eklendi.
**Dosyalar:** AGENTS.md (yeni), docs/DEGISIKLIKLER.md (yeni)
**Neden:** Depoda ajan belgesi yoktu.
**Etkisi:** —

### 2026-11-22 — Tanıtım kareleri ve klip
**Ne:** `brand/tanitim.mjs` eklendi: iki sosyal kare (1080×1350,
1080×1920) ve 13 sn'lik klip.
**Dosyalar:** brand/tanitim.mjs (yeni), brand/fonts/, README.md
**Neden:** Arayüz kart için yeniden çizilmez — çizilen arayüz uygulama
değiştikçe sessizce yalan söyler; kareler `docs/screenshots/` altındaki
gerçek görüntülerden.
**Etkisi:** Görüntü kutusunda `min-height: 0` şart; flex öğesi
içeriğinden küçülmediği için kare ekran görüntüsü künye satırını
kadrajın dışına itiyordu (ölçüldü).
