const API_BASE_URL =
  import.meta.env.VITE_API_URL || "http://localhost:3000";

async function request<T>(endpoint: string): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`API error: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

export type LiveVehicle = {
  imei: string;
  lat: number;
  lon: number;
  time: string;
  speed_kph?: number;
  course?: number;
  satellites?: number;
};

export async function getLatestPositions(): Promise<LiveVehicle[]> {
  return request<LiveVehicle[]>("/api/latest");
}

export async function getLatestPositionByImei(
  imei: string
): Promise<LiveVehicle> {
  return request<LiveVehicle>(`/api/latest/${imei}`);
}

export async function getPlayback(imei: string, from: string, to: string) {
  const params = new URLSearchParams({
    imei,
    from,
    to,
  });

  return request(`/api/playback?${params.toString()}`);
}