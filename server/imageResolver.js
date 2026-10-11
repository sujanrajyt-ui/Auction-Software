import dns from 'node:dns';
import {
  BUILTIN_LOGOS,
  findBuiltInLogo,
  generateCrestSvgDataUri,
  generateItemSvgDataUri,
  IPL_PLAYER_STATS,
  FOOTBALL_PLAYER_STATS
} from '../shared/constants.js';

try {
  dns.setDefaultResultOrder('ipv4first');
} catch {
  // Ignore if unsupported in environment
}

const FETCH_TIMEOUT_MS = 6500;

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      ...options,
      headers: {
        'User-Agent': 'VistaPresentsTheVerdict/1.0 (NMAMIT Auction Platform; contact@nmamit.in)',
        Accept: 'application/json',
        ...(options.headers || {})
      },
      signal: controller.signal
    });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

export function isRealOnlineImage(url) {
  if (!url || typeof url !== 'string') return false;
  const lower = url.trim().toLowerCase();
  if (!lower.startsWith('http://') && !lower.startsWith('https://')) return false;
  if (lower.includes('ui-avatars.com')) return false;
  return true;
}

function isSuitableImageUrl(url) {
  if (!url || typeof url !== 'string') return false;
  const lower = url.toLowerCase();
  if (
    lower.includes('disambig') ||
    lower.includes('question_book') ||
    lower.includes('wiki_letter') ||
    lower.includes('ambox') ||
    lower.includes(' stub') ||
    lower.includes('flag_of_') ||
    lower.includes(' map ') ||
    lower.includes('commons-logo') ||
    lower.includes('default_') ||
    lower.includes('no_image') ||
    lower.includes('replace_this_image') ||
    lower.includes('cricket_ball') ||
    lower.includes('cricket_bat') ||
    lower.includes('pictogram') ||
    lower.includes('autograph') ||
    lower.includes('signature') ||
    lower.endsWith('.svg') ||
    lower.includes('.svg.png')
  ) {
    return false;
  }
  return (
    lower.startsWith('http://') ||
    lower.startsWith('https://') ||
    lower.startsWith('data:image/')
  );
}

function sanitizeSearchName(raw) {
  return String(raw || '')
    .replace(/\(Prime\)/gi, '')
    .replace(/\(Legend\)/gi, '')
    .replace(/\(Overseas\)/gi, '')
    .replace(/\(Retained[^)]*\)/gi, '')
    .replace(/\(La Masia[^)]*\)/gi, '')
    .replace(/\(Club[^)]*\)/gi, '')
    .replace(/\(Captain[^)]*\)/gi, '')
    .replace(/\(Core[^)]*\)/gi, '')
    .replace(/\[OS\]/gi, '')
    .replace(/✈️/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const WIKI_PAGE_OVERRIDES = {
  // Footballers
  'rodri': 'Rodri_(footballer,_born_1996)',
  'pedri': 'Pedri',
  'endrick': 'Endrick_(footballer,_born_2006)',
  'pelé': 'Pelé',
  'ronaldo nazário': 'Ronaldo_(Brazilian_footballer)',
  'ronaldinho': 'Ronaldinho',
  'kaká': 'Kaká',
  'gavi': 'Gavi_(footballer)',
  'alisson becker': 'Alisson_Becker',
  'vinícius júnior': 'Vinícius_Júnior',
  'kylian mbappé': 'Kylian_Mbappé',
  'rafael leão': 'Rafael_Leão',
  'lautaro martínez': 'Lautaro_Martínez',
  'andrés iniesta': 'Andrés_Iniesta',
  'xavi hernández': 'Xavi_(footballer,_born_1980)',
  'martin ødegaard': 'Martin_Ødegaard',
  // Cricketers with common name collisions
  'abhishek sharma': 'Abhishek_Sharma_(cricketer,_born_2000)',
  'mohsin khan': 'Mohsin_Khan_(Indian_cricketer)',
  'mukesh kumar': 'Mukesh_Kumar_(cricketer)',
  'sandeep sharma': 'Sandeep_Sharma_(cricketer)',
  'david miller': 'David_Miller_(South_African_cricketer)',
  'cameron green': 'Cameron_Green_(cricketer)',
  'daryl mitchell': 'Daryl_Mitchell_(cricketer)',
  'glenn phillips': 'Glenn_Phillips_(cricketer)',
  'spencer johnson': 'Spencer_Johnson_(cricketer)',
  'varun chakravarthy': 'Varun_Chakaravarthy',
  't natarajan': 'T._Natarajan',
  'kl rahul': 'KL_Rahul',
  'ms dhoni': 'MS_Dhoni',
  'will jacks': 'Will_Jacks',
  'phil salt': 'Phil_Salt',
  'nitish kumar reddy': 'Nitish_Kumar_Reddy',
  'harshit rana': 'Harshit_Rana',
  'yash dayal': 'Yash_Dayal',
  'akash deep': 'Akash_Deep',
  'shashank singh': 'Shashank_Singh',
  'ashutosh sharma': 'Ashutosh_Sharma_(cricketer)',
  'prabhsimran singh': 'Prabhsimran_Singh',
  'sai sudharsan': 'Sai_Sudharsan',
  'shahrukh khan': 'Shahrukh_Khan_(cricketer)'
};

function detectSportContext(cleanQuery, poolHint = '') {
  const lowerKey = cleanQuery.toLowerCase();
  const poolLower = String(poolHint || '').toLowerCase();

  if (
    poolLower.includes('warehouse') ||
    poolLower.includes('unit') ||
    poolLower.includes('mystery') ||
    lowerKey.includes('unit #') ||
    lowerKey.includes('vault #') ||
    lowerKey.includes('container #')
  ) {
    return 'STORAGE';
  }

  if (
    IPL_PLAYER_STATS[lowerKey] ||
    poolLower.includes('batsm') ||
    poolLower.includes('bowler') ||
    poolLower.includes('wicket') ||
    poolLower.includes('all-rounder') ||
    poolLower.includes('uncapped') ||
    poolLower.includes('marquee') ||
    poolLower.includes('spin') ||
    poolLower.includes('fast') ||
    poolLower.includes('ipl') ||
    poolLower.includes('cricket')
  ) {
    return 'CRICKET';
  }

  if (
    FOOTBALL_PLAYER_STATS[lowerKey] ||
    poolLower.includes('striker') ||
    poolLower.includes('winger') ||
    poolLower.includes('midfield') ||
    poolLower.includes('back') ||
    poolLower.includes('keeper') ||
    poolLower.includes('football')
  ) {
    return 'FOOTBALL';
  }

  return 'GENERAL';
}

function matchesSportText(text, sportContext) {
  if (!text) return false;
  const lower = String(text).toLowerCase();
  if (sportContext === 'CRICKET') {
    return (
      lower.includes('cricket') ||
      lower.includes('ipl') ||
      lower.includes('indian premier league') ||
      lower.includes('batsman') ||
      lower.includes('batter') ||
      lower.includes('bowler') ||
      lower.includes('wicket') ||
      lower.includes('all-rounder') ||
      lower.includes('twenty20')
    );
  }
  if (sportContext === 'FOOTBALL') {
    return (
      lower.includes('football') ||
      lower.includes('soccer') ||
      lower.includes('striker') ||
      lower.includes('midfielder') ||
      lower.includes('defender') ||
      lower.includes('goalkeeper') ||
      lower.includes('winger') ||
      lower.includes('premier league') ||
      lower.includes('la liga') ||
      lower.includes('serie a') ||
      lower.includes('bundesliga')
    );
  }
  return true;
}

/**
 * Primary search: Wikipedia REST Page Summary + MediaWiki PageImages API
 */
async function searchWikipediaImage(query, skipUrl = null, poolHint = '') {
  const cleanQuery = sanitizeSearchName(query);
  if (!cleanQuery) return null;

  const sportContext = detectSportContext(cleanQuery, poolHint);
  if (sportContext === 'STORAGE') return null;

  const lowerKey = cleanQuery.toLowerCase();
  const hasExplicitOverride = Boolean(WIKI_PAGE_OVERRIDES[lowerKey]);
  const directCandidates = hasExplicitOverride
    ? [WIKI_PAGE_OVERRIDES[lowerKey]]
    : sportContext === 'CRICKET'
    ? [`${cleanQuery.replace(/\s+/g, '_')}_(cricketer)`, cleanQuery.replace(/\s+/g, '_')]
    : sportContext === 'FOOTBALL'
    ? [`${cleanQuery.replace(/\s+/g, '_')}_(footballer)`, cleanQuery.replace(/\s+/g, '_')]
    : [cleanQuery.replace(/\s+/g, '_')];

  // 1. Try direct Wikipedia REST Summary with strict sport verification
  for (const titleCandidate of directCandidates) {
    try {
      const encoded = encodeURIComponent(titleCandidate);
      const res = await fetchWithTimeout(
        `https://en.wikipedia.org/api/rest_v1/page/summary/${encoded}`
      );
      if (res.ok) {
        const data = await res.json();
        if (data?.type !== 'disambiguation') {
          const combinedBio = `${data?.title || ''} ${data?.description || ''} ${data?.extract || ''}`;
          if (hasExplicitOverride || matchesSportText(combinedBio, sportContext)) {
            const candidate = data?.originalimage?.source || data?.thumbnail?.source;
            if (isSuitableImageUrl(candidate) && candidate !== skipUrl) {
              return candidate;
            }
          }
        }
      }
    } catch {
      // Continue to next candidate
    }
  }

  // 2. Try Wikipedia Action API search with pageimages + description verification
  const searchQueries =
    sportContext === 'CRICKET'
      ? [`${cleanQuery} cricketer`, `${cleanQuery} IPL cricketer`, cleanQuery]
      : sportContext === 'FOOTBALL'
      ? [`${cleanQuery} footballer`, cleanQuery]
      : [cleanQuery];

  for (const sq of searchQueries) {
    try {
      const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(
        sq
      )}&gsrlimit=6&prop=pageimages|description|extracts&exintro=1&explaintext=1&piprop=thumbnail|original&pithumbsize=600&format=json&origin=*`;
      const res = await fetchWithTimeout(searchUrl);
      if (res.ok) {
        const data = await res.json();
        const pages = Object.values(data?.query?.pages || {}).sort(
          (a, b) => (a.index || 99) - (b.index || 99)
        );
        for (const page of pages) {
          const combinedBio = `${page?.title || ''} ${page?.description || ''} ${page?.extract || ''}`;
          if (!matchesSportText(combinedBio, sportContext)) {
            continue;
          }
          const src = page?.original?.source || page?.thumbnail?.source;
          if (isSuitableImageUrl(src) && src !== skipUrl) {
            return src;
          }
        }
      }
    } catch {
      // Try next query
    }
  }

  return null;
}

/**
 * Additional source 1: TheSportsDB Player/Team Search API (free public key = 3)
 */
async function searchSportsDbImage(query, type = 'player', skipUrl = null, poolHint = '') {
  const cleanQuery = sanitizeSearchName(query);
  if (!cleanQuery) return null;

  const sportContext = detectSportContext(cleanQuery, poolHint);

  try {
    if (type === 'team') {
      const res = await fetchWithTimeout(
        `https://www.thesportsdb.com/api/v1/json/3/searchteams.php?t=${encodeURIComponent(cleanQuery)}`
      );
      if (res.ok) {
        const data = await res.json();
        const teams = data?.teams || [];
        for (const t of teams) {
          const badge = t.strBadge || t.strLogo;
          if (isSuitableImageUrl(badge) && badge !== skipUrl) {
            return badge;
          }
        }
      }
    } else {
      const res = await fetchWithTimeout(
        `https://www.thesportsdb.com/api/v1/json/3/searchplayers.php?p=${encodeURIComponent(cleanQuery)}`
      );
      if (res.ok) {
        const data = await res.json();
        const players = data?.player || [];
        for (const p of players) {
          const pSport = String(p.strSport || '').toLowerCase();
          if (sportContext === 'CRICKET' && pSport && !pSport.includes('cricket')) {
            continue;
          }
          if (
            sportContext === 'FOOTBALL' &&
            pSport &&
            !pSport.includes('soccer') &&
            !pSport.includes('football')
          ) {
            continue;
          }
          const img = p.strCutout || p.strThumb || p.strRender;
          if (isSuitableImageUrl(img) && img !== skipUrl) {
            return img;
          }
        }
      }
    }
  } catch {
    // Ignore network failures
  }
  return null;
}

/**
 * Additional source 2: Wikimedia Commons File Search
 */
async function searchWikimediaCommonsImage(query, skipUrl = null, poolHint = '') {
  const cleanQuery = sanitizeSearchName(query);
  if (!cleanQuery) return null;

  const sportContext = detectSportContext(cleanQuery, poolHint);
  const searchPhrase =
    sportContext === 'CRICKET'
      ? `filetype:bitmap ${cleanQuery} cricketer`
      : sportContext === 'FOOTBALL'
      ? `filetype:bitmap ${cleanQuery} footballer`
      : `filetype:bitmap ${cleanQuery}`;

  try {
    const url = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(
      searchPhrase
    )}&gsrnamespace=6&gsrlimit=5&prop=imageinfo&iiprop=url&iiurlwidth=600&format=json&origin=*`;
    const res = await fetchWithTimeout(url);
    if (res.ok) {
      const data = await res.json();
      const pages = Object.values(data?.query?.pages || {});
      for (const p of pages) {
        const titleLower = String(p?.title || '').toLowerCase();
        if (
          titleLower.includes('stadium') ||
          titleLower.includes('trophy') ||
          titleLower.includes('logo') ||
          titleLower.includes('flag')
        ) {
          continue;
        }
        const info = p?.imageinfo?.[0];
        const candidate = info?.thumburl || info?.url;
        if (isSuitableImageUrl(candidate) && candidate !== skipUrl) {
          return candidate;
        }
      }
    }
  } catch {
    // Ignore network failures
  }
  return null;
}

/**
 * Automatic Item/Player Image Resolution Pipeline
 */
export async function resolveItemImage({ name, pool = 'General', skipUrl = null, existingUrl = null }) {
  if (!name) {
    return generateItemSvgDataUri({ name: 'Item', pool });
  }

  const effectiveSkip = isRealOnlineImage(skipUrl) ? skipUrl : null;

  // Step 1: Primary image search (Wikipedia with strict cricketer/footballer verification)
  const wikiImg = await searchWikipediaImage(name, effectiveSkip, pool);
  if (wikiImg && isSuitableImageUrl(wikiImg)) {
    return wikiImg;
  }

  // Step 2: Additional sources (TheSportsDB + Wikimedia Commons with sport filter)
  const sportsImg = await searchSportsDbImage(name, 'player', effectiveSkip, pool);
  if (sportsImg && isSuitableImageUrl(sportsImg)) {
    return sportsImg;
  }

  const commonsImg = await searchWikimediaCommonsImage(name, effectiveSkip, pool);
  if (commonsImg && isSuitableImageUrl(commonsImg)) {
    return commonsImg;
  }

  // If effectiveSkip was set and no alternative image existed, try without skip so we still return a real photo
  if (effectiveSkip) {
    const primaryWiki = await searchWikipediaImage(name, null, pool);
    if (primaryWiki && isSuitableImageUrl(primaryWiki)) return primaryWiki;
    const primarySports = await searchSportsDbImage(name, 'player', null, pool);
    if (primarySports && isSuitableImageUrl(primarySports)) return primarySports;
    return effectiveSkip;
  }

  if (isRealOnlineImage(existingUrl)) {
    return existingUrl;
  }

  // Step 3: Generic high-contrast Vista placeholder
  return generateItemSvgDataUri({ name, pool });
}

/**
 * Section 7: Team Logo Resolution Pipeline
 * 1. Search built-in library (+ custom DB library)
 * 2. Automatically search the web for official logo
 * 3. If unavailable, use generic placeholder with official/team colours
 */
export async function resolveTeamIdentity({
  name,
  shortName,
  primaryColor,
  secondaryColor,
  logoUrl,
  customLogos = []
}) {
  // 1. Check custom DB logo library + built-in logo library
  const allLibrary = [...customLogos, ...BUILTIN_LOGOS];
  const q = String(name || '').trim().toLowerCase();
  const sq = String(shortName || '').trim().toLowerCase();

  const match =
    allLibrary.find(
      l =>
        l.name.toLowerCase() === q ||
        (sq && l.shortName?.toLowerCase() === sq) ||
        l.id?.toLowerCase() === q
    ) || findBuiltInLogo(name);

  const resolvedPrimary = primaryColor || match?.primaryColor || '#3B82F6';
  const resolvedSecondary = secondaryColor || match?.secondaryColor || '#F59E0B';
  const resolvedShort =
    shortName ||
    match?.shortName ||
    String(name || 'TM')
      .split(/\s+/)
      .map(w => w[0])
      .join('')
      .slice(0, 3)
      .toUpperCase();

  if (logoUrl && isSuitableImageUrl(logoUrl)) {
    return {
      logoUrl,
      primaryColor: resolvedPrimary,
      secondaryColor: resolvedSecondary,
      shortName: resolvedShort
    };
  }

  if (match?.logoUrl) {
    return {
      logoUrl: match.logoUrl,
      primaryColor: resolvedPrimary,
      secondaryColor: resolvedSecondary,
      shortName: resolvedShort
    };
  }

  // 2. Search the web for official club/organization logo
  const sportsTeamBadge = await searchSportsDbImage(name, 'team');
  if (sportsTeamBadge && isSuitableImageUrl(sportsTeamBadge)) {
    return {
      logoUrl: sportsTeamBadge,
      primaryColor: resolvedPrimary,
      secondaryColor: resolvedSecondary,
      shortName: resolvedShort
    };
  }

  const wikiLogo = await searchWikipediaImage(`${name} logo`);
  if (wikiLogo && isSuitableImageUrl(wikiLogo)) {
    return {
      logoUrl: wikiLogo,
      primaryColor: resolvedPrimary,
      secondaryColor: resolvedSecondary,
      shortName: resolvedShort
    };
  }

  // 3. Fallback to crisp SVG crest placeholder
  return {
    logoUrl: generateCrestSvgDataUri({
      name,
      shortName: resolvedShort,
      primaryColor: resolvedPrimary,
      secondaryColor: resolvedSecondary
    }),
    primaryColor: resolvedPrimary,
    secondaryColor: resolvedSecondary,
    shortName: resolvedShort
  };
}
