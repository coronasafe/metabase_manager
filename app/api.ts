import { Card, OrderedCard, Dashboard, Server } from "@/types";
import toast from "react-hot-toast";

const API_URL = "/api";

const request = async (
  input: string,
  init?: RequestInit & { params?: Record<string, string | number> }
): Promise<any> => {
  try {
    input = `${window.location.origin}${API_URL}${input}`;
    if (init?.params) {
      let url = new URL(input);
      Object.entries(init.params).forEach(([key, value]) => {
        url.searchParams.append(key, value.toString());
      });
      input = url.toString();
    }
    let headers = init?.headers ?? {};
    if (init?.body) {
      headers = {
        ...headers,
        "Content-Type": "application/json",
      };
    }
    const response = await fetch(input, { ...init, headers });
    const text = await response.text();
    try {
      const data = text ? JSON.parse(text) : {};
      if (!response.ok || data.error) {
        throw new Error(JSON.stringify(data.error) ?? response.statusText);
      }
      return data;
    } catch (e) {
      throw new Error(text || "Internal Server Error");
    }
  } catch (error: any) {
    const errorMessage = `Request Error: \n ${error.message}`;
    console.error(errorMessage);
    toast.error(errorMessage);
    throw error;
  }
};

export async function getMapping(
  source_entity_id: string,
  type?: string,
  source_host?: string,
  destination_host?: string
) {
  return request("/database/mapping", {
    method: "GET",
    params: {
      source_entity_id,
      type: type ?? "",
      source_host: source_host ?? "",
      destination_host: destination_host ?? "",
    },
  });
}

export async function createMapping(
  source_entity_id: string,
  destination_entity_id: string,
  source_server: string,
  destination_host: string,
  type: string
) {
  return request("/database/mapping", {
    method: "POST",
    body: JSON.stringify({ source_entity_id, destination_entity_id, source_server, destination_host, type }),
  });
}

export async function deleteMapping(host: string, entity_id: string, type: string) {
  return request("/database/mapping", {
    method: "DELETE",
    body: JSON.stringify({ host, entity_id, type }),
  });
}

export async function updateMapping(
  source_entity_id: string,
  destination_entity_id: string,
  destination_host: string,
  type: string
) {
  return request("/database/mapping", {
    method: "PATCH",
    body: JSON.stringify({ source_entity_id, destination_entity_id, destination_host, type }),
  });
}

export async function cardList(host: string, session_token: string) {
  return request("/card", {
    method: "GET",
    params: { host, session_token },
  });
}

export async function getCardDetailsByEntityID(host: string, session_token: string, card_entity_id: string) {
  return request("/card", {
    method: "GET",
    params: { host, session_token, card_entity_id },
  });
}

export async function createCard(
  source_host: string,
  dest_host: string,
  source_session_token: string,
  dest_session_token: string,
  destination_database: string | undefined,
  card_data: Card,
  collection_id?: string,
  dest_card_id?: number
) {
  return request("/card", {
    method: "POST",
    body: JSON.stringify({
      source_host,
      dest_host,
      source_session_token,
      dest_session_token,
      destination_database,
      card_data,
      collection_id,
      dest_card_id,
    }),
  });
}

export async function collectionList(host: string, session_token: string) {
  return request("/collection", {
    method: "GET",
    params: { host, session_token },
  });
}

export async function collectionItemsList(
  host: string,
  session_token: string,
  collection_id: string,
  item_type: string
) {
  return request("/collection/items", {
    method: "GET",
    params: { host, session_token, collection_id, item_type },
  });
}

export async function createCollection(
  host: string,
  session_token: string,
  collection_name: string,
  parent_id: string
) {
  return request("/collection", {
    method: "POST",
    body: JSON.stringify({ host, session_token, collection_name, parent_id }),
  });
}

export async function databaseList(host: string, session_token: string) {
  return request("/database", {
    method: "GET",
    params: { host, session_token },
  });
}

export async function datasetQueryConvert(
  host: string,
  session_token: string,
  database: string,
  query: object,
  query_type: string
) {
  return request("/database/convert", {
    method: "POST",
    body: JSON.stringify({ host, session_token, database, query, query_type }),
  });
}

export function login(host: string, email: string, password: string) {
  return request("/login", {
    method: "POST",
    body: JSON.stringify({ host, email, password }),
  });
}

export async function dbSchemaFetch(host: string, session_token: string, database: string) {
  return request("/database/schema", {
    method: "GET",
    params: { host, session_token, database },
  });
}

export async function dashboardList(host: string, session_token: string) {
  return request("/dashboard", {
    method: "GET",
    params: { host, session_token },
  });
}

export async function putOrderedCards(
  source_ordered_cards: OrderedCard[],
  dest_collection_id: string | undefined,
  source_host: string,
  destination_host: string,
  dest_session_token: string,
  dest_dashboard_id: string
) {
  return request("/orderedCards", {
    method: "POST",
    body: JSON.stringify({
      source_ordered_cards,
      dest_collection_id,
      source_host,
      destination_host,
      dest_session_token,
      dest_dashboard_id,
    }),
  });
}

export async function getDashboardDetailsByID(host: string, session_token: string, dashboard_id: number) {
  return request("/dashboard", {
    method: "GET",
    params: { host, session_token, dashboard_id },
  });
}

export async function createDashboard(
  source_host: string,
  dest_host: string,
  source_session_token: string,
  dest_session_token: string,
  destination_database: string | undefined,
  dashboard_data: Dashboard,
  collection_id: string | undefined,
  dest_dashboard_id: number | undefined,
  includes_markdown_cards: boolean,
  markdown_card_exclude_regex: string | undefined
) {
  return request("/dashboard", {
    method: "POST",
    body: JSON.stringify({
      source_host,
      dest_host,
      source_session_token,
      dest_session_token,
      destination_database,
      dashboard_data,
      collection_id,
      dest_dashboard_id,
      includes_markdown_cards,
      markdown_card_exclude_regex,
    }),
  });
}

export async function clearAllMapping(hosts: string[]) {
  return request("/database/mapping/clear", {
    method: "POST",
    body: JSON.stringify({ hosts }),
  });
}

export async function createSyncLog(
  status: string,
  detailedRecords: any,
  sourceEmail: string,
  sourceHost: string,
  destinationHost: string
) {
  return request("/database/logging", {
    method: "POST",
    body: JSON.stringify({ status, detailedRecords, sourceEmail, sourceHost, destinationHost }),
  });
}

export async function updateSyncLog(
  id: number,
  status: string,
  detailedRecords: any
) {
  return request("/database/logging", {
    method: "PATCH",
    body: JSON.stringify({ id, status, detailedRecords }),
  });
}

export async function getAllSyncLogs() {
  return request("/database/logging", {
    method: "GET",
  });
}

export async function getSyncLogById(id: number) {
  return request("/database/logging", {
    method: "GET",
    params: { id },
  });
}
