const TWITCH_GQL_ENDPOINT = "https://gql.twitch.tv/gql";
const TWITCH_PUBLIC_CLIENT_ID = "kimne78kx3ncx6brgo4mv6wki5h1ko";
const LIVE_STATUS_CACHE_TTL_MS = 15000;

const liveStatusCache = new Map();
const liveStatusInFlight = new Map();

const LIVE_STATUS_QUERY = `
  query ChannelLiveCheck($login: String!) {
    user(login: $login) {
      stream {
        id
      }
    }
  }
`;

export async function selectLiveChannels(channels, maxStreams) {
  const targetChannels = (Array.isArray(channels) ? channels : [])
    .map((channel) => String(channel || "").toLowerCase())
    .filter(Boolean);
  const limit = Math.max(0, Number(maxStreams) || 0);

  if (targetChannels.length === 0 || limit === 0) {
    return [];
  }

  const statuses = await Promise.all(
    targetChannels.map((channel) => getChannelLiveStatus(channel))
  );
  const liveChannels = [];
  for (let index = 0; index < targetChannels.length; index += 1) {
    if (liveChannels.length >= limit) {
      break;
    }

    if (statuses[index] === "live") {
      liveChannels.push(targetChannels[index]);
    }
  }

  return liveChannels;
}

export async function getChannelsLiveStatus(channels) {
  const targetChannels = [...new Set((Array.isArray(channels) ? channels : [])
    .map((channel) => String(channel || "").toLowerCase())
    .filter(Boolean))];
  const statuses = await Promise.all(
    targetChannels.map((channel) => getChannelLiveStatus(channel))
  );

  return Object.fromEntries(
    targetChannels.map((channel, index) => [channel, statuses[index]])
  );
}

async function getChannelLiveStatus(channel) {
  const now = Date.now();
  const cached = liveStatusCache.get(channel);
  if (cached && cached.expiresAt > now) {
    return cached.status;
  }

  const inFlight = liveStatusInFlight.get(channel);
  if (inFlight) {
    return inFlight;
  }

  const request = (async () => {
    try {
      const response = await fetch(TWITCH_GQL_ENDPOINT, {
        method: "POST",
        headers: {
          "Client-ID": TWITCH_PUBLIC_CLIENT_ID,
          "Content-Type": "text/plain;charset=UTF-8"
        },
        body: JSON.stringify({
          operationName: "ChannelLiveCheck",
          query: LIVE_STATUS_QUERY,
          variables: {
            login: channel
          }
        })
      });

      if (!response.ok) {
        throw new Error(`status ${response.status}`);
      }

      const payload = await response.json();
      const status = payload?.data?.user?.stream?.id ? "live" : "offline";
      liveStatusCache.set(channel, {
        status,
        expiresAt: Date.now() + LIVE_STATUS_CACHE_TTL_MS
      });
      return status;
    } catch (error) {
      console.warn(
        "Stream Guard: live status unavailable.",
        channel,
        error
      );
      liveStatusCache.set(channel, {
        status: "unknown",
        expiresAt: Date.now() + LIVE_STATUS_CACHE_TTL_MS
      });
      return "unknown";
    }
  })();

  liveStatusInFlight.set(channel, request);
  try {
    return await request;
  } finally {
    liveStatusInFlight.delete(channel);
  }
}
