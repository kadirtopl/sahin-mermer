// ====== AYARLAR — buradan düzenleyin ======
export const PHONE = '905465994669';           // WhatsApp numarası (90 ile)
export const OWNER = 'Muhammet Ali Bey';

// Çark dilimleri (görünüm). Hepsini işletme onaylamalı.
export const PRIZES = [
  { label: '%5 İndirim',          short: '%5',          color: '#1b1916' },
  { label: 'Ücretsiz Keşif',      short: 'Keşif',       color: '#d9b77a' },
  { label: '%10 İndirim',         short: '%10',         color: '#f4f0e9' },
  { label: 'Bakım Seti Hediye',   short: 'Bakım Seti',  color: '#2a2622' },
  { label: '%7 İndirim',          short: '%7',          color: '#b8915a' },
  { label: 'Evye Montajı Bedava', short: 'Evye',        color: '#1b1916' },
  { label: '%15 İndirim',         short: '%15',         color: '#f4f0e9' },
  { label: 'Süpürgelik Hediye',   short: 'Süpürgelik',  color: '#d9b77a' },
];
// Her telefon bu kadar çevirir; sıradaki çevirmede çarkın duracağı dilim.
// Son dilim kazanılan indirimdir (telefona kaydedilir, tekrar açınca aynısı görünür).
export const SPIN_PLAN = ['%5 İndirim', '%10 İndirim'];
export const PRIZE_HOURS = 48;

// Ürün serileri
export const LINES = {
  m: { name: 'Maestro Kuvars', short: 'Kuvars', desc: 'Granitaş güvencesiyle kuvars yüzey: leke tutmaz, gözeneksiz, mutfak için en çok tercih edilen.' },
  p: { name: 'Porselen', short: 'Porselen', desc: 'Infinity porselen levha: ısıya, çizilmeye ve UV’ye dayanıklı; büyük ebat, derzsiz ve ince.' },
};
export const FAMS = [
  { id: 'beyaz', name: 'Beyaz', dot: '#f3f0ea' },
  { id: 'krem', name: 'Krem · Bej', dot: '#dccbb0' },
  { id: 'gri', name: 'Gri', dot: '#8e8c88' },
  { id: 'siyah', name: 'Siyah · Koyu', dot: '#17161a' },
  { id: 'renkli', name: 'Renkli', dot: 'conic-gradient(#2c4f8f,#3e7d5c,#b8915a,#7c2c3a,#2c4f8f)' },
];
// Açılıştaki 3D halkada dönen taşlar
export const RING = ['p-calacatta-oro', 'm-fortuna', 'p-classic-statuario', 'm-serenade', 'p-sahara-noir', 'm-figaro', 'p-magellano', 'p-verde-france', 'm-spring', 'p-pietra-grey'];
// Kategori kartının kapak görseli (ilk görsel değilse)
export const CAT_ICON = { mutfak: '🍳', ada: '🏝️', masa: '🍽️', duvar: '🧱', 'tezgah-alni': '🔲', merdiven: '🪜', denizlik: '🪟' };
