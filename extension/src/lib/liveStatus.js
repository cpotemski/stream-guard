const TWITCH_GQL_ENDPOINT = "https://gql.twitch.tv/gql";
const TWITCH_PUBLIC_CLIENT_ID = "kimne78kx3ncx6brgo4mv6wki5h1ko";
const LIVE_STATUS_CACHE_TTL_MS = 15000;
const LIVE_STATUS_WARNING_COOLDOWN_MS = 300000;

const liveStatusCache = new Map();
const liveStatusInFlight = new Map();
const liveStatusWarningAtByChannel = new Map();

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

  const states = await Promise.all(
    targetChannels.map((channel) => getChannelLiveState(channel))
  );
  const liveChannels = [];
  for (let index = 0; index < targetChannels.length; index += 1) {
    if (liveChannels.length >= limit) {
      break;
    }

    if (states[index]?.status === "live") {
      liveChannels.push(targetChannels[index]);
    }
  }

  return liveChannels;
}

export async function getChannelsLiveStatus(channels) {
  const statesByChannel = await getChannelsLiveState(channels);

  return Object.fromEntries(
    Object.entries(statesByChannel).map(([channel, state]) => [channel, state.status])
  );
}

export async function getChannelsLiveState(channels) {
  const targetChannels = [...new Set((Array.isArray(channels) ? channels : [])
    .map((channel) => String(channel || "").toLowerCase())
    .filter(Boolean))];
  const states = await Promise.all(
    targetChannels.map((channel) => getChannelLiveState(channel))
  );

  return Object.fromEntries(
    targetChannels.map((channel, index) => [channel, states[index]])
  );
}

async function getChannelLiveState(channel) {
  const now = Date.now();
  const cached = liveStatusCache.get(channel);
  if (cached && cached.expiresAt > now) {
    return cached.state;
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
      const streamId = String(payload?.data?.user?.stream?.id || "").trim();
      const state = {
        status: streamId ? "live" : "offline",
        streamId: streamId || null
      };
      liveStatusCache.set(channel, {
        state,
        expiresAt: Date.now() + LIVE_STATUS_CACHE_TTL_MS
      });
      return state;
    } catch (error) {
      maybeWarnLiveStatusUnavailable(channel, error);
      liveStatusCache.set(channel, {
        state: {
          status: "unknown",
          streamId: null
        },
        expiresAt: Date.now() + LIVE_STATUS_CACHE_TTL_MS
      });
      return {
        status: "unknown",
        streamId: null
      };
    }
  })();

  liveStatusInFlight.set(channel, request);
  try {
    return await request;
  } finally {
    liveStatusInFlight.delete(channel);
  }
}

function maybeWarnLiveStatusUnavailable(channel, error) {
  const normalizedChannel = String(channel || "").toLowerCase();
  if (!normalizedChannel) {
    return;
  }

  const now = Date.now();
  const lastWarningAt = Math.round(Number(liveStatusWarningAtByChannel.get(normalizedChannel) || 0));
  if (lastWarningAt > 0 && now - lastWarningAt < LIVE_STATUS_WARNING_COOLDOWN_MS) {
    return;
  }

  liveStatusWarningAtByChannel.set(normalizedChannel, now);
  console.warn(
    "Stream Guard: live status unavailable.",
    normalizedChannel,
    error
  );
}
