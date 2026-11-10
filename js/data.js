// ====== AYARLAR — buradan düzenleyin ======
export const PHONE = '905465994669';           // WhatsApp numarası (90 ile)
export const OWNER = 'Muhammet Ali Bey';

// Çark ödülleri: weight = çıkma ağırlığı (yüksek = daha sık). Hepsini işletme onaylamalı.
export const PRIZES = [
  { label: '%5 İndirim',          short: '%5',          weight: 26, color: '#1b1916' },
  { label: 'Ücretsiz Keşif',      short: 'Keşif',       weight: 18, color: '#d9b77a' },
  { label: '%10 İndirim',         short: '%10',         weight: 14, color: '#f4f0e9' },
  { label: 'Bakım Seti Hediye',   short: 'Bakım Seti',  weight: 12, color: '#2a2622' },
  { label: '%7 İndirim',          short: '%7',          weight: 16, color: '#b8915a' },
  { label: 'Evye Montajı Bedava', short: 'Evye',        weight: 8,  color: '#1b1916' },
  { label: '%15 İndirim',         short: '%15',         weight: 2,  color: '#f4f0e9' },
  { label: 'Süpürgelik Hediye',   short: 'Süpürgelik',  weight: 4,  color: '#d9b77a' },
];
export const PRIZE_HOURS = 48;

// Taşlar (dokular: assets/stone/*.webp, CC0 ambientCG)
export const STONES = [
  { id: 'statuario',     name: 'Statuario',        tag: 'Beyaz · ince gri damar',   desc: 'Bembeyaz zemin üzerinde ince gri damarlar. Mutfağı ferah ve lüks gösterir; en çok tercih edilen.', ai: 'bright white Statuario marble with thin soft grey veins' },
  { id: 'bianco-carrara',name: 'Bianco Carrara',   tag: 'Kırık beyaz · yumuşak',    desc: 'Sıcak beyaz, belli belirsiz damar. Sade, zamansız ve her dolap rengine uyar.', ai: 'soft white Carrara marble with very subtle light grey veining' },
  { id: 'nero-marquina', name: 'Nero Marquina',    tag: 'Siyah · beyaz damar',      desc: 'Derin siyah zemin, keskin beyaz damarlar. Beyaz dolapla güçlü kontrast.', ai: 'deep black Nero Marquina marble with crisp white veins' },
  { id: 'crema-marfil',  name: 'Crema Marfil',     tag: 'Krem · bej',               desc: 'Krem bej tonları, sıcak ve klasik. Ahşap ve krem dolaplarla mükemmel.', ai: 'warm beige Crema Marfil marble with soft cream and tan veining' },
  { id: 'grigio-venato', name: 'Grigio Venato',    tag: 'Gri · bulut damar',        desc: 'Açık gri zemin, bulut gibi koyu damarlar. Modern ve leke göstermez.', ai: 'light grey marble with cloudy darker grey veining' },
  { id: 'travertino',    name: 'Travertino',       tag: 'Bej · yatay doku',         desc: 'Yatay akışlı bej traverten dokusu. Doğal, sakin, Akdeniz havası.', ai: 'honey beige vein-cut travertine with horizontal flowing bands' },
  { id: 'nero-antico',   name: 'Nero Antico',      tag: 'Siyah · altın-gri damar',  desc: 'Siyah zemin üzerinde sıcak, dağınık damarlar. Gece mavisi ve altın aksesuarla şık.', ai: 'black marble with scattered warm grey and faint gold veins' },
  { id: 'granit-verde',  name: 'Granit Verde',     tag: 'Koyu yeşil-siyah granit',  desc: 'Çok sert koyu granit. Yoğun kullanım, ısı ve çizilmeye karşı en dayanıklısı.', ai: 'dark green-black polished granite with fine dark crystalline flecks' },
];

// Kategoriler. base = gerçek iş fotoğrafları (yedek görsel), gen = Gemini ile üretilecek sahneler
export const CATS = [
  { id: 'mutfak', name: 'Mutfak Tezgahı', icon: '🍳', service: 'Mutfak tezgahı',
    base: ['assets/img/mutfak-calacatta.webp', 'assets/img/mutfak-siyah.webp', 'assets/img/mutfak-gri.webp', 'assets/vid/waterfall-ada.webp'] },
];
