const TWITCH_GQL_ENDPOINT = "https://gql.twitch.tv/gql";
const TWITCH_PUBLIC_CLIENT_ID = "kimne78kx3ncx6brgo4mv6wki5h1ko";

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

  const liveChannels = [];

  for (const channel of targetChannels) {
    if (liveChannels.length >= limit) {
      break;
    }

    if ((await getChannelLiveStatus(channel)) === "live") {
      liveChannels.push(channel);
    }
  }

  return liveChannels;
}

export async function getChannelsLiveStatus(channels) {
  const targetChannels = [...new Set((Array.isArray(channels) ? channels : [])
    .map((channel) => String(channel || "").toLowerCase())
    .filter(Boolean))];
  const statusByChannel = {};

  for (const channel of targetChannels) {
    statusByChannel[channel] = await getChannelLiveStatus(channel);
  }

  return statusByChannel;
}

async function getChannelLiveStatus(channel) {
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
    return payload?.data?.user?.stream?.id ? "live" : "offline";
  } catch (error) {
    console.warn(
      "TW Watch Guard: live status unavailable.",
      channel,
      error
    );
    return "unknown";
  }
}
