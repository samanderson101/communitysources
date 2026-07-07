// client/src/App.js

import React, { useState, useEffect } from 'react';
import { nip19 } from 'nostr-tools';
import {
  LuHouse,
  LuBookmark,
  LuBookmarkCheck,
  LuPlus,
  LuTrendingUp,
  LuLandmark,
  LuCoins,
  LuDna,
  LuFilm,
  LuMic,
  LuMusic,
} from 'react-icons/lu';
import { SiBluesky, SiMastodon } from 'react-icons/si';
import { FaDove } from 'react-icons/fa6';
import './App.css';
import Screenshot from './screenshot.png';

const API_URL = process.env.REACT_APP_API_URL || '/api';

const TABS = [
  { label: 'Sources', Icon: LuTrendingUp },
  { label: 'Gov', Icon: LuLandmark },
  { label: 'Econ', Icon: LuCoins },
  { label: 'Sci', Icon: LuDna },
  { label: 'Film', Icon: LuFilm },
  { label: 'Pod', Icon: LuMic },
  { label: 'Music', Icon: LuMusic },
];

const NETWORKS = {
  nostr: {
    label: 'Nostr',
    Icon: FaDove,
    url: 'https://nostr.org',
    description: 'Nostr is a decentralized social network built on open protocols.',
  },
  bluesky: {
    label: 'Bluesky',
    Icon: SiBluesky,
    url: 'https://bsky.social/about',
    description:
      'Bluesky is a decentralized social network focused on a new approach to social media.',
  },
  mastodon: {
    label: 'Mastodon',
    Icon: SiMastodon,
    url: 'https://joinmastodon.org',
    description: 'Mastodon is a free, open-source social network server.',
  },
};

const LoadingIndicator = () => (
  <div className="loading-indicator">
    <div className="spinner"></div>
  </div>
);

const AgeConfirmationModal = ({ isVisible, onConfirm }) => {
  if (!isVisible) return null;
  return (
    <div className="modal">
      <div className="modal-content">
        <h2>Welcome to Community Sources</h2>
        <h4>An effort to bring the best out of social media and promote citizen journalism.</h4>
        <img className="image" src={Screenshot} alt="Screenshot" />
        <p>
          We encourage respectful behavior, but due to the unpredictable nature of content on social
          media, we ask that only people 16 years or older use the app.
        </p>
        <button className="confirm-button" onClick={onConfirm}>
          Continue (I am 16 or older)
        </button>
      </div>
    </div>
  );
};

const SourceTag = ({ network, category }) => {
  const { label, Icon } = NETWORKS[network];
  return (
    <span className="source-tag">
      <Icon className="source-icon" aria-hidden="true" />
      {label}
      {category ? ` · ${category}` : ''}
    </span>
  );
};

const NetworkButton = ({ network, enabled, onToggle }) => {
  const { label, Icon, url, description } = NETWORKS[network];
  return (
    <div className="network-button-container">
      <button
        onClick={() => onToggle(network)}
        className={`network-button ${enabled ? 'active' : ''}`}
        aria-pressed={enabled}
      >
        <Icon className="network-icon" aria-hidden="true" /> {label}
      </button>
      <div className="tooltip">
        <p>{description}</p>
        <a href={url} target="_blank" rel="noopener noreferrer">
          Learn more
        </a>
      </div>
    </div>
  );
};

const App = () => {
  const [feed, setFeed] = useState({ blueskyFeed: [], nostrFeed: [], mastodonFeed: [] });
  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState({ bluesky: null, nostr: null, mastodon: null });
  const [activeTab, setActiveTab] = useState(0);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isAgeConfirmed, setIsAgeConfirmed] = useState(false);
  const [bookmarks, setBookmarks] = useState([]);
  const [currentPage, setCurrentPage] = useState('main');
  const [enabledNetworks, setEnabledNetworks] = useState({
    nostr: true,
    bluesky: true,
    mastodon: true,
  });

  const preferredLanguages = navigator.language || 'en-US';

  useEffect(() => {
    const ageConfirmed = localStorage.getItem('ageConfirmed');
    if (ageConfirmed === 'true') {
      setIsAgeConfirmed(true);
    }

    try {
      const savedBookmarks = JSON.parse(localStorage.getItem('bookmarks')) || [];
      setBookmarks(savedBookmarks);
    } catch (error) {
      console.error('Failed to parse saved bookmarks:', error);
      setBookmarks([]);
    }
  }, []);

  const handleConfirmAge = () => {
    localStorage.setItem('ageConfirmed', 'true');
    setIsAgeConfirmed(true);
  };

  useEffect(() => {
    if (currentPage !== 'main') return;

    const controller = new AbortController();

    const fetchFeed = async () => {
      setLoading(true);
      setErrors({ bluesky: null, nostr: null, mastodon: null });
      setFeed({ blueskyFeed: [], nostrFeed: [], mastodonFeed: [] });

      try {
        const response = await fetch(
          `${API_URL}/feed?activeTab=${activeTab}&preferredLanguages=${preferredLanguages}`,
          { signal: controller.signal }
        );
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        setFeed(data);
      } catch (error) {
        if (error.name === 'AbortError') return;
        console.error('Error fetching feeds:', error);
        setErrors({
          bluesky: 'Failed to fetch Bluesky feed',
          nostr: 'Failed to fetch Nostr feed',
          mastodon: 'Failed to fetch Mastodon feed',
        });
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    };

    fetchFeed();

    return () => controller.abort();
  }, [activeTab, preferredLanguages, currentPage]);

  const formatTimeAgo = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const differenceInSeconds = Math.floor((now - date) / 1000);

    if (differenceInSeconds < 60) {
      return `${differenceInSeconds} second${differenceInSeconds !== 1 ? 's' : ''} ago`;
    } else if (differenceInSeconds < 3600) {
      const minutes = Math.floor(differenceInSeconds / 60);
      return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`;
    } else if (differenceInSeconds < 86400) {
      const hours = Math.floor(differenceInSeconds / 3600);
      return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
    } else {
      const days = Math.floor(differenceInSeconds / 86400);
      return `${days} day${days !== 1 ? 's' : ''} ago`;
    }
  };

  const renderEmbed = (embed) => {
    if (embed?.$type === 'app.bsky.embed.external') {
      const { uri, title, description } = embed.external;
      return (
        <div className="embed-card">
          <a href={uri} target="_blank" rel="noopener noreferrer">
            <div className="embed-content">
              <h4>{title}</h4>
              <h5>{uri}</h5>
              <p>{description}</p>
            </div>
          </a>
        </div>
      );
    }
    return null;
  };

  const renderLink = (facets, embed) => {
    if (embed?.$type !== 'app.bsky.embed.external') {
      if (!facets || !Array.isArray(facets)) {
        return null;
      }

      const uriLink = facets.reduce((link, facet) => {
        if (link) return link;
        return (
          facet.features?.find(
            (feature) => feature.$type === 'app.bsky.richtext.facet#link'
          )?.uri || ''
        );
      }, '');

      return uriLink ? (
        <div className="embed-card">
          <a href={uriLink} target="_blank" rel="noopener noreferrer">
            <div className="embed-content">
              <h4>{uriLink}</h4>
            </div>
          </a>
        </div>
      ) : null;
    }
    return null;
  };

  const renderNostrContent = (content) => {
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const parts = content.split(urlRegex);

    return (
      <>
        {parts.map((part, index) => {
          if (part.match(urlRegex)) {
            return (
              <div key={index} className="embed-card">
                <a href={part} target="_blank" rel="noopener noreferrer">
                  <div className="embed-content">
                    <h4>{part}</h4>
                  </div>
                </a>
              </div>
            );
          }
          return <span key={index}>{part}</span>;
        })}
      </>
    );
  };

  const renderMastodonContent = (content) => {
    const urlRegex = /(https?:\/\/[^\s<]+[^<.,:;"')\]\s])/g;
    const links = content.match(urlRegex) || [];

    const textContent = content.replace(urlRegex, '');

    return (
      <>
        <div dangerouslySetInnerHTML={{ __html: textContent }} />
        {links.map((link, index) => (
          <div key={index} className="embed-card">
            <a href={link} target="_blank" rel="noopener noreferrer">
              <div className="embed-content">
                <h4>{link}</h4>
              </div>
            </a>
          </div>
        ))}
      </>
    );
  };

  const getItemId = (item) => {
    switch (item.source) {
      case 'bluesky':
        return item.post?.uri;
      case 'nostr':
      case 'mastodon':
      default:
        return item.id;
    }
  };

  const handleBookmark = (item) => {
    const itemId = getItemId(item);
    const newBookmarks = [...bookmarks];
    const index = newBookmarks.findIndex((bookmark) => getItemId(bookmark) === itemId);

    if (index === -1) {
      newBookmarks.push(item);
    } else {
      newBookmarks.splice(index, 1);
    }

    setBookmarks(newBookmarks);
    localStorage.setItem('bookmarks', JSON.stringify(newBookmarks));
  };

  const isBookmarked = (item) => {
    const itemId = getItemId(item);
    return bookmarks.some((bookmark) => getItemId(bookmark) === itemId);
  };

  const renderPost = (item, source) => {
    const bookmarked = isBookmarked(item);
    const bookmarkButton = (
      <button
        onClick={() => handleBookmark(item)}
        className={`bookmark-button ${bookmarked ? 'bookmarked' : ''}`}
        aria-label={bookmarked ? 'Remove bookmark' : 'Add bookmark'}
        title={bookmarked ? 'Remove bookmark' : 'Add bookmark'}
      >
        {bookmarked ? <LuBookmarkCheck /> : <LuBookmark />}
      </button>
    );

    const category = TABS[activeTab]?.label;

    switch (source) {
      case 'bluesky':
        return (
          <div className="item" key={item.post.uri}>
            {bookmarkButton}
            <p>{formatTimeAgo(item.post.indexedAt)}</p>
            {renderEmbed(item.post.embed)}
            {renderLink(item.post.facets, item.post.embed)}
            <div dangerouslySetInnerHTML={{ __html: item.markdown }} />
            <div className="row">
              <a
                style={{ marginRight: 'auto', fontSize: '10pt' }}
                className="viewLink"
                href={`https://bsky.app/profile/${item.post.author.did}/post/${
                  item.post.uri.split('/').pop()
                }`}
                target="_blank"
                rel="noopener noreferrer"
              >
                by {item.post.author.displayName}
              </a>
              <a
                style={{ marginLeft: 'auto' }}
                className="viewLink"
                href={`https://bsky.app/profile/${item.post.author.did}/post/${
                  item.post.uri.split('/').pop()
                }`}
                target="_blank"
                rel="noopener noreferrer"
              >
                from <SourceTag network="bluesky" category={category} />
              </a>
            </div>
          </div>
        );
      case 'nostr':
        return (
          <div className="item" key={item.id}>
            {bookmarkButton}
            <p>{formatTimeAgo(new Date(item.created_at * 1000).toISOString())}</p>
            <div>{renderNostrContent(item.content)}</div>
            <div className="row">
              <a
                style={{ marginRight: 'auto', fontSize: '10pt' }}
                className="viewLink"
                href={`https://njump.me/${nip19.noteEncode(item.id)}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                by {nip19.npubEncode(item.pubkey).slice(0, 12)}...
              </a>
              <a
                style={{ marginLeft: 'auto' }}
                className="viewLink"
                href={`https://njump.me/${nip19.noteEncode(item.id)}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                from <SourceTag network="nostr" category={category} />
              </a>
            </div>
          </div>
        );
      case 'mastodon':
        return (
          <div className="item" key={item.id}>
            {bookmarkButton}
            <p>{formatTimeAgo(item.createdAt)}</p>
            {renderMastodonContent(item.content)}
            <div className="row">
              <a
                style={{ marginRight: 'auto', fontSize: '10pt' }}
                className="viewLink"
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                by {item.account.displayName}
              </a>
              <a
                style={{ marginLeft: 'auto' }}
                className="viewLink"
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                from <SourceTag network="mastodon" category={category} />
              </a>
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  const filteredCombinedFeed =
    currentPage === 'main'
      ? [
          ...(enabledNetworks.bluesky
            ? feed.blueskyFeed.map((item) => ({ ...item, source: 'bluesky' }))
            : []),
          ...(enabledNetworks.nostr
            ? feed.nostrFeed.map((item) => ({ ...item, source: 'nostr' }))
            : []),
          ...(enabledNetworks.mastodon
            ? feed.mastodonFeed.map((item) => ({ ...item, source: 'mastodon' }))
            : []),
        ].sort((a, b) => {
          const dateA = new Date(
            a.source === 'nostr'
              ? a.created_at * 1000
              : a.post?.indexedAt || a.createdAt
          );
          const dateB = new Date(
            b.source === 'nostr'
              ? b.created_at * 1000
              : b.post?.indexedAt || b.createdAt
          );
          return dateB - dateA;
        })
      : bookmarks;

  const handleModalOpen = () => setIsModalOpen(true);
  const handleModalClose = () => setIsModalOpen(false);

  const toggleNetwork = (network) => {
    setEnabledNetworks((prev) => ({
      ...prev,
      [network]: !prev[network],
    }));
  };

  return (
    <div className="App">
      <AgeConfirmationModal isVisible={!isAgeConfirmed} onConfirm={handleConfirmAge} />
      {isAgeConfirmed && (
        <div className={`App ${!loading ? 'fade-in' : ''}`}>
          <div className="appBar">
            <div className="navigation">
              <button
                onClick={() => setCurrentPage('main')}
                className={currentPage === 'main' ? 'active' : ''}
              >
                <LuHouse className="nav-icon" aria-hidden="true" /> Home
              </button>
              <button
                onClick={() => setCurrentPage('bookmarks')}
                className={currentPage === 'bookmarks' ? 'active' : ''}
              >
                <LuBookmark className="nav-icon" aria-hidden="true" /> Saved
              </button>
            </div>
            <div>
              <h1 className="appTitle">Community Sources</h1>
            </div>
            <div className="networks">
              <NetworkButton
                network="nostr"
                enabled={enabledNetworks.nostr}
                onToggle={toggleNetwork}
              />
              <NetworkButton
                network="bluesky"
                enabled={enabledNetworks.bluesky}
                onToggle={toggleNetwork}
              />
              <NetworkButton
                network="mastodon"
                enabled={enabledNetworks.mastodon}
                onToggle={toggleNetwork}
              />
            </div>
          </div>

          {currentPage === 'main' && (
            <div className="tabs">
              {TABS.map((tab, index) => {
                const TabIcon = tab.Icon;
                return (
                  <button
                    key={index}
                    onClick={() => setActiveTab(index)}
                    className={activeTab === index ? 'active' : ''}
                  >
                    <TabIcon className="tab-icon" aria-hidden="true" /> {tab.label}
                  </button>
                );
              })}
            </div>
          )}

          <div className="feed">
            {loading && currentPage === 'main' && <LoadingIndicator />}
            {currentPage === 'main' && errors.bluesky && (
              <div className="error-message">
                Error loading Bluesky feed: {errors.bluesky}
              </div>
            )}
            {currentPage === 'main' && errors.nostr && (
              <div className="error-message">Error loading Nostr feed: {errors.nostr}</div>
            )}
            {currentPage === 'main' && errors.mastodon && (
              <div className="error-message">
                Error loading Mastodon feed: {errors.mastodon}
              </div>
            )}
            {filteredCombinedFeed.map((item) => renderPost(item, item.source))}
            {!loading && filteredCombinedFeed.length === 0 && (
              <div className="no-posts">No posts available</div>
            )}
          </div>

          <div className="fab" onClick={handleModalOpen} role="button" aria-label="Post">
            <LuPlus aria-hidden="true" />
          </div>

          {isModalOpen && (
            <div className="modal">
              <div className="modal-content">
                <h2>Post to Community Sources</h2>
                <p>
                  By posting on Bluesky and including a cited link from one of the following
                  sources, your post will automatically appear in our custom feeds.
                </p>
                <div className="source-links">
                  <button onClick={() => window.open('https://bsky.app', '_blank')}>
                    <SiBluesky className="network-icon" aria-hidden="true" /> Bluesky
                  </button>
                </div>
                <button className="close" onClick={handleModalClose}>
                  Close
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default App;
