# spotify-lyrics-badge

Vercel üzerinde barınan, GitHub profil README'niz için **gerçek zamanlı Spotify Now Playing + senkronize şarkı sözü** SVG kartı. [natemoo-re/novatorem](https://github.com/natemoo-re/novatorem) tarzı koyu/minimalist tasarıma, [LRCLIB](https://lrclib.net) üzerinden çekilen anlık lirik satırını ekler.

> Kart, çaldığınız şarkının o anki saniyesine denk gelen lirik satırını alt kısımda gösterir. Hiçbir şey çalmıyorsa şık bir "Offline" kartına düşer. Deploy ettikten sonra `/api` uç noktasını tarayıcıda açarak kartın gerçek görüntüsünü kendiniz görebilirsiniz.

## Özellikler

- 🎧 Spotify `currently-playing` uç noktasından anlık şarkı bilgisi, hiçbir şey çalmıyorsa son çalınan şarkıya (last played) düşer.
- 🎤 LRCLIB'den senkronize (`syncedLyrics`) lirik verisi, `progressMs` değerine göre doğru satırın seçilmesi.
- 🖼️ Albüm kapağı base64 olarak SVG içine gömülür (GitHub Camo CORS/hotlink sorunlarını önlemek için).
- 🌓 Koyu tema, yuvarlatılmış köşeler, animasyonlu ekolayzer çubukları, ilerleme çubuğu.
- ⚡ Vercel Serverless Function, agresif önbelleklemeyi engelleyen cache başlıkları.

## Proje Yapısı

```
.
├── api/
│   └── index.ts        # Vercel serverless function (SVG endpoint)
├── lib/
│   ├── spotify.ts       # Spotify OAuth token yenileme + now-playing/recently-played
│   ├── lyrics.ts        # LRCLIB entegrasyonu + LRC zaman damgası parser
│   └── render.ts        # SVG kart şablonu (playing / offline)
├── .env.example
├── package.json
├── tsconfig.json
└── vercel.json
```

## Kurulum

### 1. Bağımlılıkları yükleyin

```bash
npm install
```

### 2. Spotify Developer Dashboard'dan kimlik bilgisi alın

1. [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard) adresine gidip Spotify hesabınızla giriş yapın.
2. **Create app** butonuna tıklayın, bir isim/açıklama girin.
3. **Redirect URI** alanına şunu ekleyin: `http://localhost:8888/callback` (sadece token almak için kullanılacak, geçici bir adres).
4. Uygulamayı oluşturduktan sonra **Settings** sayfasından `Client ID` ve `Client Secret` değerlerini not edin.

### 3. Refresh token üretin (bir kereye mahsus)

Spotify API, kullanıcı adına veri okumak için OAuth **authorization code** akışı gerektirir. Aşağıdaki adımları takip edin:

1. Aşağıdaki URL'yi kendi `CLIENT_ID` değerinizle tarayıcınızda açın (scope'lar now-playing ve recently-played okuma içindir):

   ```
   https://accounts.spotify.com/authorize?client_id=CLIENT_ID&response_type=code&redirect_uri=http://localhost:8888/callback&scope=user-read-currently-playing%20user-read-playback-state%20user-read-recently-played
   ```

2. İzin verdikten sonra tarayıcı sizi `http://localhost:8888/callback?code=...` adresine yönlendirecek (sayfa hata verse de sorun değil, sadece URL'deki `code` parametresini kopyalayın).

3. Aldığınız `code` değerini kullanarak terminalde aşağıdaki isteği çalıştırın (`CLIENT_ID` ve `CLIENT_SECRET` değerlerini kendi bilgilerinizle değiştirin):

   ```bash
   curl -X POST https://accounts.spotify.com/api/token \
     -H "Authorization: Basic $(echo -n 'CLIENT_ID:CLIENT_SECRET' | base64)" \
     -d grant_type=authorization_code \
     -d code=YAPIŞTIRDIĞINIZ_CODE \
     -d redirect_uri=http://localhost:8888/callback
   ```

4. Dönen JSON içindeki `refresh_token` değerini kopyalayın — bu, uygulamanın kalıcı olarak kullanacağı tokendır.

### 4. Ortam değişkenlerini ayarlayın

`.env.example` dosyasını `.env` olarak kopyalayıp değerleri doldurun:

```bash
cp .env.example .env
```

```
SPOTIFY_CLIENT_ID=xxxxxxxx
SPOTIFY_CLIENT_SECRET=xxxxxxxx
SPOTIFY_REFRESH_TOKEN=xxxxxxxx
```

### 5. Yerelde çalıştırın

```bash
npx vercel dev
```

Ardından `http://localhost:3000/api` adresini tarayıcıda açarak kartı görüntüleyin.

### 6. Vercel'e deploy edin

```bash
npx vercel
```

Deploy sırasında (veya Vercel Dashboard → Project → Settings → Environment Variables üzerinden) `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET` ve `SPOTIFY_REFRESH_TOKEN` değişkenlerini ekleyin, sonra production'a deploy edin:

```bash
npx vercel --prod
```

## GitHub Profil README'nize Ekleme

Deploy ettiğiniz Vercel domain'ini kullanarak profil README'nize aşağıdaki gibi bir görsel ekleyin:

```markdown
![Spotify](https://SIZIN-PROJENIZ.vercel.app/api)
```

GitHub, harici görselleri kendi Camo proxy'si üzerinden önbelleğe alır. Bu servis `Cache-Control: public, max-age=0, s-maxage=1, must-revalidate` başlığını göndererek Camo'nun veriyi mümkün olduğunca taze tutmasını sağlar; yine de GitHub tarafında birkaç dakikalık gecikme görebilirsiniz.

## Type Check

```bash
npm run type-check
```

## Nasıl Çalışır?

1. `GET /api` isteği geldiğinde `lib/spotify.ts`, refresh token ile yeni bir access token alır ve `currently-playing` uç noktasını sorgular. Hiçbir şey çalmıyorsa `recently-played` uç noktasına düşer.
2. Bir parça bulunduysa `lib/lyrics.ts`, LRCLIB'den `track_name`, `artist_name` ve `duration` parametreleriyle senkronize lirikleri çeker, `[mm:ss.xx]` zaman damgalarını milisaniyeye çevirir ve şarkının `progressMs` değerine en yakın geçmiş satırı seçer. Senkronize lirik yoksa düz metnin ilk satırına, o da yoksa `"♫ Instrumental or No Lyrics Found ♫"` mesajına düşer.
3. `lib/render.ts`, albüm kapağını indirip base64 data URI'ye çevirir (harici URL referansı bırakmaz) ve tüm veriyi tek bir SVG şablonuna basar.
4. `api/index.ts`, sonucu `image/svg+xml` içerik tipiyle ve agresif önbelleklemeyi engelleyen başlıklarla döner.

## Lisans

MIT
