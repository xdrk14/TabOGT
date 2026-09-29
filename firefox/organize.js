// Sorts bookmarks into topic sections for "Organize into a workspace".
// Rules are checked in order: a known domain wins, then keywords in the URL or title,
// then the folder the bookmark was imported from, then its website.
import { host } from './store.js';

const RULES = [
  ['AI', /(^|\.)(openai|chatgpt|claude|anthropic|perplexity|huggingface|midjourney|gemini\.google|copilot\.microsoft|poe|character\.ai|mistral|groq|replicate|runwayml|elevenlabs)\./, /\b(ai|gpt|llm|chatbot|prompt|machine learning|neural)\b/],
  ['Dev', /(^|\.)(github|gitlab|bitbucket|stackoverflow|stackexchange|npmjs|pypi|developer\.mozilla|dev\.to|codepen|jsfiddle|replit|vercel|netlify|heroku|docker|kubernetes|aws\.amazon|cloud\.google|azure|digitalocean|cloudflare|localhost|127\.0\.0\.1|w3schools|leetcode|hackerrank|devdocs|rust-lang|python|nodejs|reactjs|react|vuejs|svelte|nextjs|tailwindcss|firebase|supabase|postman|jetbrains|visualstudio)\./, /\b(api|docs?|developer|programming|code|coding|javascript|typescript|python|github|sdk|framework|library|devops|css|html|sql)\b/],
  ['Design', /(^|\.)(figma|dribbble|behance|canva|adobe|unsplash|pexels|coolors|fonts\.google|fontawesome|awwwards|pinterest|framer|sketch|spline|lottiefiles|iconify|flaticon|freepik)\./, /\b(design|ui|ux|font|icons?|palette|colou?rs?|typography|mockup|illustration|inspiration)\b/],
  ['Video', /(^|\.)(youtube|youtu|vimeo|twitch|netflix|primevideo|disneyplus|hulu|max|crunchyroll|dailymotion|kick|tiktok)\./, /\b(video|watch|stream|movie|film|series|episode|trailer)\b/],
  ['Music', /(^|\.)(spotify|soundcloud|music\.apple|bandcamp|deezer|tidal|last\.fm|genius|music\.youtube)\./, /\b(music|song|album|playlist|podcast|lyrics)\b/],
  ['Social', /(^|\.)(twitter|x|facebook|instagram|reddit|linkedin|threads|bsky|mastodon|discord|whatsapp|telegram|snapchat|tumblr|quora|messenger)\./, /\b(community|forum|profile)\b/],
  ['News', /(^|\.)(bbc|cnn|nytimes|theguardian|reuters|apnews|bloomberg|wsj|washingtonpost|theverge|techcrunch|wired|arstechnica|engadget|news\.ycombinator|aljazeera|ft|economist|axios|vox|medium|substack)\./, /\b(news|article|blog|daily|weekly|newsletter)\b/],
  ['Shopping', /(^|\.)(amazon|ebay|etsy|aliexpress|walmart|target|bestbuy|ikea|shopify|temu|shein|argos|currys|zalando|asos|nike|apple\.com\/shop)\./, /\b(shop|store|buy|deal|cart|price|sale|order)\b/],
  ['Finance', /(^|\.)(paypal|stripe|wise|revolut|monzo|coinbase|binance|kraken|robinhood|tradingview|investing|yahoo\.finance|finance\.yahoo|barclays|hsbc|lloyds|natwest|chase|santander|nationwide)\./, /\b(bank|finance|invest|crypto|stocks?|budget|tax|payments?|wallet)\b/],
  ['Learning', /(^|\.)(coursera|udemy|edx|khanacademy|duolingo|skillshare|brilliant|udacity|freecodecamp|codecademy|pluralsight|masterclass|scholar\.google|arxiv|researchgate|jstor)\./, /\b(course|learn|tutorial|lesson|guide|study|university|research|paper)\b/],
  ['Work', /(^|\.)(notion|slack|trello|asana|atlassian|jira|monday|clickup|linear|zoom|teams\.microsoft|office|outlook|docs\.google|drive\.google|sheets\.google|calendar\.google|dropbox|box|airtable|miro|calendly|mail\.google|gmail)\./, /\b(dashboard|workspace|project|calendar|meeting|invoice|crm|admin)\b/],
  ['Reference', /(^|\.)(wikipedia|wikihow|britannica|dictionary|merriam-webster|thesaurus|wolframalpha|archive|translate\.google|deepl|maps\.google|google\.com\/maps)\./, /\b(wiki|reference|dictionary|translate|maps?)\b/],
  ['Gaming', /(^|\.)(steampowered|steamcommunity|epicgames|ign|gamespot|playstation|xbox|nintendo|itch|roblox|minecraft|chess|lichess|curseforge|nexusmods)\./, /\b(game|gaming|steam|esports|mods?)\b/],
  ['Travel', /(^|\.)(booking|airbnb|expedia|skyscanner|tripadvisor|kayak|hotels|trainline|uber|ryanair|easyjet|britishairways|emirates|google\.com\/travel)\./, /\b(travel|flight|hotel|trip|holiday|vacation)\b/],
  ['Health', /(^|\.)(nhs|webmd|mayoclinic|healthline|myfitnesspal|strava|fitbit|headspace|calm)\./, /\b(health|fitness|workout|diet|nutrition|recipe|recipes|cooking)\b/]
];

export const CATEGORY_ORDER = [...RULES.map(r => r[0]), 'Other'];

export function categorize(item) {
  const hs = host(item.url).toLowerCase() + '.';
  const text = `${item.url} ${item.title} ${(item.tags || []).join(' ')}`.toLowerCase();
  for (const [name, domains] of RULES) if (domains.test(hs) || domains.test(item.url.toLowerCase().replace(/^https?:\/\/(www\.)?/, '') + '.')) return name;
  for (const [name, , words] of RULES) if (words.test(text)) return name;
  return 'Other';
}

// Returns [[sectionName, items[]], ...] with duplicates removed and each section sorted by title.
// Folders from the import are kept as a tiebreaker: an "Other" bookmark from a named folder
// goes into a section named after that folder when the folder has at least 3 such bookmarks.
export function organize(items, urlKey) {
  const seen = new Set(), groups = new Map();
  const add = (k, it) => { if (!groups.has(k)) groups.set(k, []); groups.get(k).push(it); };
  const others = [];
  for (const it of items) {
    const k = urlKey(it.url);
    if (seen.has(k)) continue;
    seen.add(k);
    const c = categorize(it);
    if (c === 'Other') others.push(it); else add(c, it);
  }
  const byFolder = new Map();
  for (const it of others) {
    const f = (it.folder || '').split(' / ').pop().trim();
    if (!byFolder.has(f)) byFolder.set(f, []);
    byFolder.get(f).push(it);
  }
  for (const [f, list] of byFolder) {
    const keep = f && list.length >= 3 && !/^(imported|unsorted|bookmarks( bar)?|other bookmarks)$/i.test(f);
    list.forEach(it => add(keep ? f : 'Other', it));
  }
  const order = name => { const i = CATEGORY_ORDER.indexOf(name); return i < 0 ? CATEGORY_ORDER.length - 1.5 : i; };
  return [...groups].sort((a, b) => order(a[0]) - order(b[0]) || a[0].localeCompare(b[0]))
    .map(([name, list]) => [name, list.sort((a, b) => a.title.localeCompare(b.title))]);
}
