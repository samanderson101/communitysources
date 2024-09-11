require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');
const { AtpAgent, RichText } = require('@atproto/api');
const { SimplePool, nip19 } = require('nostr-tools');
const Mastodon = require('mastodon-api');
const NodeCache = require('node-cache');
const rateLimit = require('express-rate-limit');
const winston = require('winston');

const app = express();
const port = process.env.PORT || 3001;

// Logging configuration
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  defaultMeta: { service: 'community-sources' },
  transports: [
	new winston.transports.File({ filename: 'error.log', level: 'error' }),
	new winston.transports.File({ filename: 'combined.log' })
  ]
});

if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
	format: winston.format.simple()
  }));
}

// Middleware
app.use(cors({ origin: process.env.FRONTEND_URL }));
app.use(express.json());

// Rate limiting
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});
app.use("/api/", apiLimiter);

// Token bucket for Bluesky rate limiting
const tokenBucket = {
  tokens: 5,
  lastRefill: Date.now(),
  refillRate: 60000, // 1 token per minute
  capacity: 5
};

function getToken() {
  const now = Date.now();
  const timeSinceLastRefill = now - tokenBucket.lastRefill;
  const refillAmount = Math.floor(timeSinceLastRefill / tokenBucket.refillRate);

  if (refillAmount > 0) {
	tokenBucket.tokens = Math.min(tokenBucket.capacity, tokenBucket.tokens + refillAmount);
	tokenBucket.lastRefill = now;
  }

  if (tokenBucket.tokens > 0) {
	tokenBucket.tokens--;
	return true;
  }

  return false;
}

const nostrCache = new NodeCache({ stdTTL: 600 }); // Cache for 10 minutes

const feedLinks = [
  'at://did:plc:hd4p7hmwqy3egilcv6lgjpzf/app.bsky.feed.generator/aaap7msb6vmdg',
  'at://did:plc:hd4p7hmwqy3egilcv6lgjpzf/app.bsky.feed.generator/aaap7i2f6e3kq',
  'at://did:plc:hd4p7hmwqy3egilcv6lgjpzf/app.bsky.feed.generator/aaacsjo76q5g4',
  'at://did:plc:hd4p7hmwqy3egilcv6lgjpzf/app.bsky.feed.generator/aaab4n3ofdehe',
  'at://did:plc:hd4p7hmwqy3egilcv6lgjpzf/app.bsky.feed.generator/aaaburmrbef3k',
  'at://did:plc:hd4p7hmwqy3egilcv6lgjpzf/app.bsky.feed.generator/aaab4xs76ypte',
  'at://did:plc:hd4p7hmwqy3egilcv6lgjpzf/app.bsky.feed.generator/aaabut5jyrc6c',
  'at://did:plc:hd4p7hmwqy3egilcv6lgjpzf/app.bsky.feed.generator/gggp7i2f6e3kq',
];

const nostrSearchPatterns = [
  /\.gov\/|bea\.gov|stlouisfed\.org|worldbank\.org|bls\.gov|imf\.org|oecd\.org|europa\.eu\/eurostat|unstats\.un\.org|arxiv\.org|nih\.gov|nasa\.gov|science\.org|cell\.com|pnas\.org/i,
  /\.gov\//i,
  /bea\.gov|stlouisfed\.org|worldbank\.org|bls\.gov|imf\.org|oecd\.org|europa\.eu\/eurostat|unstats\.un\.org/i,
  /arxiv\.org|nih\.gov|nasa\.gov|science\.org|cell\.com|pnas\.org/i,
  /imdb\.com|rottentomatoes\.com|netflix\.com|hulu\.com|amazon\.com\/gp\/video\/|play\.max\.com/i,
  /podcasts\.apple\.com|open\.spotify\.com\/episode\/|open\.spotify\.com\/show\//i,
  /spotify\.com\/artist|spotify\.com\/track|spotify\.com\/album|music\.apple\.com|soundcloud\.com/i,
].map(regex => new RegExp(regex.source, 'i'));

async function fetchBlueskyPosts(activeTab, preferredLanguages) {
  logger.info('Fetching Bluesky posts for tab:', activeTab);
  
  if (!getToken()) {
	logger.warn('Rate limit exceeded for Bluesky');
	return [];
  }

  const agent = new AtpAgent({ service: 'https://bsky.social' });

  try {
	await agent.login({
	  identifier: process.env.BLUESKY_IDENTIFIER,
	  password: process.env.BLUESKY_PASSWORD,
	});

	const { data } = await agent.api.app.bsky.feed.getFeed(
	  {
		feed: feedLinks[activeTab],
		limit: 50,
	  },
	  {
		headers: {
		  'Accept-Language': preferredLanguages,
		},
	  }
	);
	const { feed: postsArray } = data;
	
	const processedPosts = await Promise.all(
	  postsArray.map(async (item) => {
		const rt = new RichText({ text: item.post.record.text });
		await rt.detectFacets(agent);
	
		let markdown = '';
		for (const segment of rt.segments()) {
		  if (segment.isLink()) {
			markdown += `${segment.link?.uri}`;
		  } else if (segment.isMention()) {
			markdown += `[${segment.text}](https://my-bsky-app.com/user/${segment.mention?.did})`;
		  } else {
			markdown += segment.text;
		  }
		}
	
		return {
		  ...item,
		  markdown,
		  post: {
			...item.post,
			facets: item.post.record.facets,
			embed: item.post.record.embed,
		  },
		};
	  })
	);

	logger.info(`Processed ${processedPosts.length} Bluesky posts`);
	return processedPosts;
  } catch (error) {
	logger.error("Error fetching Bluesky posts:", error);
	return [];
  }
}

async function fetchNostrPosts(activeTab) {
  logger.info('Fetching Nostr posts for tab:', activeTab);

  const cacheKey = `nostr_${activeTab}`;
  const cachedResult = nostrCache.get(cacheKey);
  if (cachedResult) {
	logger.info(`Returning ${cachedResult.length} cached Nostr events`);
	return cachedResult;
  }

  const relays = [
	'wss://relay.nostr.band',
	'wss://relay.damus.io',
	'wss://sources.nostr1.com',
	'wss://relay.nos.social',
	'wss://nostr-relay.app',
	'wss://nostr.land',
	'wss://nos.lol',
	'wss://relay.nostr.bg',
	'wss://relay.current.fyi',
	'wss://relay.snort.social',
	'wss://relay.nostr.info'
  ];

  const pool = new SimplePool();

  try {
	const oneWeekAgo = Math.floor(Date.now() / 1000) - 14 * 24 * 60 * 60;
	
	const events = await new Promise((resolve) => {
	  let collectedEvents = [];
	  const sub = pool.sub(relays, [{
		kinds: [1],
		since: oneWeekAgo,
	  }]);

	  sub.on('event', (event) => {
		if (nostrSearchPatterns[activeTab].test(event.content)) {
		  collectedEvents.push(event);
		}
	  });

	  setTimeout(() => {
		sub.unsub();
		resolve(collectedEvents);
	  }, 10000); // Wait for 10 seconds to collect events
	});

	const processedEvents = events.map(event => ({
	  id: event.id,
	  pubkey: event.pubkey,
	  content: event.content,
	  created_at: event.created_at,
	  tags: event.tags,
	  npub: nip19.npubEncode(event.pubkey),
	}));

	logger.info(`Filtered ${processedEvents.length} Nostr events`);
	nostrCache.set(cacheKey, processedEvents);
	pool.close(relays);
	return processedEvents;
  } catch (error) {
	logger.error("Error fetching NOSTR posts:", error);
	pool.close(relays);
	return [];
  }
}

async function fetchMastodonPosts(activeTab) {
  logger.info('Fetching Mastodon posts for tab:', activeTab);

  const accessToken = process.env.MASTODON_ACCESS_TOKEN;
  const baseUrl = 'https://mastodon.social/api/v2/';

  const searchPattern = nostrSearchPatterns[activeTab];
  const searchQuery = searchPattern.source.replace(/\\\./g, '.').replace(/\|/g, ' OR ');

  let allPosts = [];
  let maxId = null;
  const postsPerPage = 40;
  const maxPages = 10;

  try {
	for (let page = 0; page < maxPages; page++) {
	  logger.info(`Fetching Mastodon posts page ${page + 1}`);
	  
	  const params = new URLSearchParams({
		q: searchQuery,
		type: 'statuses',
		limit: postsPerPage.toString(),
		...(maxId && { max_id: maxId })
	  });

	  const response = await fetch(`${baseUrl}search?${params}`, {
		method: 'GET',
		headers: {
		  'Authorization': `Bearer ${accessToken}`
		}
	  });

	  if (!response.ok) {
		throw new Error(`HTTP error! status: ${response.status}`);
	  }

	  const data = await response.json();

	  if (!data || !data.statuses || data.statuses.length === 0) {
		break;
	  }

	  const filteredPosts = data.statuses.filter(post => 
		searchPattern.test(post.content)
	  );

	  allPosts = allPosts.concat(filteredPosts);

	  if (data.statuses.length < postsPerPage) {
		break;
	  }

	  maxId = data.statuses[data.statuses.length - 1].id;
	}

	const processedPosts = allPosts.map(post => ({
	  id: post.id,
	  content: post.content,
	  createdAt: post.created_at,
	  account: {
		username: post.account.username,
		displayName: post.account.display_name,
	  },
	  url: post.url,
	}));

	logger.info(`Processed ${processedPosts.length} Mastodon posts`);
	return processedPosts;
  } catch (error) {
	logger.error("Error fetching Mastodon posts:", error.message);
	return [];
  }
}

// API Routes
app.get('/api/feed', async (req, res) => {
  const activeTab = parseInt(req.query.activeTab) || 0;
  const preferredLanguages = req.query.preferredLanguages || 'en-US';

  logger.info(`Received request for tab ${activeTab} with languages ${preferredLanguages}`);

  try {
	const [blueskyFeed, nostrFeed, mastodonFeed] = await Promise.all([
	  fetchBlueskyPosts(activeTab, preferredLanguages),
	  fetchNostrPosts(activeTab),
	  fetchMastodonPosts(activeTab)
	]);

	logger.info(`Sending response with ${blueskyFeed.length} Bluesky posts, ${nostrFeed.length} Nostr posts, and ${mastodonFeed.length} Mastodon posts`);
	res.json({ blueskyFeed, nostrFeed, mastodonFeed });
  } catch (error) {
	logger.error('Error in /api/feed:', error);
	res.status(500).json({ 
	  error: 'Error fetching feed', 
	  details: error.message,
	  stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
	});
  }
});

// Serve static files from the React app
app.use(express.static(path.join(__dirname, 'public')));

// The "catchall" handler: for any request that doesn't
// match one above, send back React's index.html file.
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error(err.stack);
  res.status(500).send('Something broke!');
});

app.listen(port, () => {
  logger.info(`Server running on port ${port}`);
});