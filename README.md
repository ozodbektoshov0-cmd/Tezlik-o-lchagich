# Tezlik o'lchagich

Telefon kamerasi bilan mashina tezligini **taxminiy** o'lchaydigan veb-ilova (rasmiy radar emas). Hamma narsa brauzerda ishlaydi, video hech qayerga yuborilmaydi. Sof statik sayt: build kerak emas.

## Fayllar
- `index.html`, `css/style.css`, `js/app.js`, `js/math.js`
- `js/account.js`, `js/firebase-config.js` — ixtiyoriy bulut akkaunti va Tarix oynasi
- `sw.js`, `manifest.webmanifest`, ikonlar — oflayn rejim va ilova sifatida o'rnatish
- `vercel.json` — Vercel sozlamalari (kamera ruxsati, kesh)

## GitHub + Vercel
1. GitHub'da yangi repo oching va shu papkadagi hamma fayllarni repo **ildiziga** yuklang (`index.html` ildizda bo'lishi shart).
2. vercel.com → Add New → Project → reponi tanlang.
3. Framework Preset: **Other**. Build Command va Output Directory'ni **bo'sh** qoldiring → Deploy.
4. Kamera faqat HTTPS'da ishlaydi; Vercel domeni HTTPS beradi.

## Bulut akkaunti (ixtiyoriy)
`js/firebase-config.js` bo'sh bo'lsa ilova akkauntsiz ishlaydi. Yoqish uchun Firebase loyihasida Authentication (Email/Parol, Google) va Firestore'ni yoqing, sozlamalarni `firebase-config.js` ga yozing va Authorized domains'ga Vercel domenini qo'shing. Firestore qoidalari:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{uid}/passes/{id} {
      allow read, write: if request.auth != null && request.auth.uid == uid;
    }
  }
}
```
