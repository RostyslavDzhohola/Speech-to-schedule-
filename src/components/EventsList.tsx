"use client";

import { useEffect, useState } from "react";

interface Event {
  id: string;
  title: string;
  start: string;
  end: string;
  location?: string;
  attendees?: string[];
  description?: string;
}

interface EventsListProps {
  refreshTrigger?: number;
}

export function EventsList({ refreshTrigger }: EventsListProps) {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchEvents = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch("/api/calendar/list?max=10");
      const data = await response.json();

      if (!response.ok) {
        // Check if it's an API not enabled error
        if (
          data.error?.includes("API is not enabled") ||
          data.error?.includes("API has not been used")
        ) {
          throw new Error(
            `Google Calendar API is not enabled. ${
              data.helpUrl
                ? `Visit ${data.helpUrl} to enable it.`
                : "Please enable it in Google Cloud Console."
            }`
          );
        }

        throw new Error(data.error || "Failed to fetch events");
      }

      setEvents(data.events || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load events");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEvents();
  }, [refreshTrigger]);

  if (loading) {
    return (
      <div className="p-4 border rounded-lg">
        <p className="text-gray-600">Loading events...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 border rounded-lg bg-red-50">
        <p className="text-red-600">Error: {error}</p>
        <button
          onClick={fetchEvents}
          className="mt-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="p-4 border rounded-lg">
      <h2 className="text-xl font-bold mb-4">Upcoming Events</h2>
      {events.length === 0 ? (
        <p className="text-gray-600">No upcoming events</p>
      ) : (
        <div className="space-y-4">
          {events.map((event) => (
            <div key={event.id} className="border-b pb-3 last:border-b-0">
              <h3 className="font-semibold text-lg">{event.title}</h3>
              <div className="text-sm text-gray-600 mt-1">
                <p>
                  {new Date(event.start).toLocaleString()} -{" "}
                  {new Date(event.end).toLocaleString()}
                </p>
                {event.location && <p>📍 {event.location}</p>}
                {event.attendees && event.attendees.length > 0 && (
                  <p>👥 {event.attendees.join(", ")}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      <button
        onClick={fetchEvents}
        className="mt-4 px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300"
      >
        Refresh
      </button>
    </div>
  );
}
