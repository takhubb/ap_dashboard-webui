import type {
  EStatClassObject,
  EStatValueRow,
  StatisticsTableSummary,
} from "@/lib/estat/types";

const ESTAT_BASE_URL = "https://api.e-stat.go.jp/rest/3.0/app/json";

type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonObject
  | JsonValue[];
type JsonObject = { [key: string]: JsonValue };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asArray<T>(value: T | T[] | undefined): T[] {
  if (!value) {
    return [];
  }

  return Array.isArray(value) ? value : [value];
}

function textFromField(value: unknown) {
  if (typeof value === "string") {
    return value;
  }

  if (isRecord(value)) {
    const candidate = value.$ ?? value["@name"] ?? value["@id"];
    return typeof candidate === "string" ? candidate : "";
  }

  return "";
}

function getConfiguredAppId() {
  return process.env.ESTAT_APP_ID || process.env.ESTAT_APP_KEY || "";
}

export function getEStatConfiguration() {
  const appId = getConfiguredAppId();
  const isConfigured = appId.length > 0;

  return {
    appId,
    isConfigured,
    message: isConfigured
      ? undefined
      : "ESTAT_APP_ID が未設定です。.env に ESTAT_APP_ID=<取得したappId> を設定してください。",
  };
}

async function requestEStat<T extends JsonObject>(
  path: string,
  params: Record<string, string | number | undefined>,
) {
  const { appId, isConfigured, message } = getEStatConfiguration();
  if (!isConfigured) {
    throw new Error(message);
  }

  const searchParams = new URLSearchParams();
  searchParams.set("appId", appId);
  searchParams.set("lang", "J");

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== "") {
      searchParams.set(key, String(value));
    }
  });

  const url = `${ESTAT_BASE_URL}/${path}?${searchParams.toString()}`;
  const maxAttempts = 3;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        cache: "no-store",
        headers: {
          Accept: "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`e-Stat API returned ${response.status}.`);
      }

      const payload = (await response.json()) as T;
      const rootValue = Object.values(payload)[0];
      const result = isRecord(rootValue) && isRecord(rootValue.RESULT)
        ? rootValue.RESULT
        : undefined;
      const statusValue = result?.STATUS;
      const status = Number(
        typeof statusValue === "string" || typeof statusValue === "number"
          ? statusValue
          : 0,
      );
      const errorMessage =
        typeof result?.ERROR_MSG === "string" ? result.ERROR_MSG : "";

      if (status > 1) {
        throw new Error(errorMessage || "e-Stat API error.");
      }

      return payload;
    } catch (error) {
      lastError = error;
      if (attempt === maxAttempts) {
        break;
      }

      await new Promise((resolve) => {
        setTimeout(resolve, 350 * attempt);
      });
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("e-Stat API request failed.");
}

function normalizeTableSummary(raw: Record<string, unknown>): StatisticsTableSummary {
  return {
    id: String(raw["@id"] ?? ""),
    title: textFromField(raw.TITLE),
    statisticsName: textFromField(raw.STATISTICS_NAME),
    statName: textFromField(raw.STAT_NAME),
    updatedDate:
      typeof raw.UPDATED_DATE === "string" ? raw.UPDATED_DATE : undefined,
    openDate: typeof raw.OPEN_DATE === "string" ? raw.OPEN_DATE : undefined,
    cycle: typeof raw.CYCLE === "string" ? raw.CYCLE : undefined,
  };
}

export async function getStatsList(params: {
  searchWord: string;
  statsCode?: string;
  limit?: number;
}) {
  const payload = await requestEStat<JsonObject>("getStatsList", {
    searchWord: params.searchWord,
    statsCode: params.statsCode,
    limit: params.limit ?? 20,
  });

  const root = payload.GET_STATS_LIST;
  const dataList = isRecord(root) && isRecord(root.DATALIST_INF)
    ? root.DATALIST_INF
    : undefined;
  const items = asArray<unknown>(dataList?.TABLE_INF).filter(isRecord);

  return items.map(normalizeTableSummary);
}

export async function getMetaInfo(statsDataId: string) {
  const payload = await requestEStat<JsonObject>("getMetaInfo", {
    statsDataId,
  });

  const root = payload.GET_META_INFO;
  const metadataInf = isRecord(root) && isRecord(root.METADATA_INF)
    ? root.METADATA_INF
    : undefined;
  const classInf = metadataInf && isRecord(metadataInf.CLASS_INF)
    ? metadataInf.CLASS_INF
    : undefined;
  const classObjects = asArray<unknown>(classInf?.CLASS_OBJ).filter(isRecord);

  const normalized: EStatClassObject[] = classObjects.map((classObject) => {
    const values = asArray<unknown>(classObject.CLASS).filter(isRecord);

    return {
      id: String(classObject["@id"] ?? ""),
      name: String(classObject["@name"] ?? ""),
      values: values.map((value) => ({
        code: String(value["@code"] ?? ""),
        name: String(value["@name"] ?? ""),
        unit: typeof value["@unit"] === "string" ? value["@unit"] : undefined,
      })),
    };
  });

  return normalized;
}

function buildSelectorParams(selectors?: Record<string, string>) {
  if (!selectors) {
    return {};
  }

  return Object.entries(selectors).reduce<Record<string, string>>(
    (params, [dimension, value]) => {
      const normalizedDimension =
        dimension.charAt(0).toUpperCase() + dimension.slice(1);
      params[`cd${normalizedDimension}`] = value;
      return params;
    },
    {},
  );
}

export async function getStatsData(
  statsDataId: string,
  selectors?: Record<string, string>,
) {
  const payload = await requestEStat<JsonObject>("getStatsData", {
    statsDataId,
    limit: 2000,
    metaGetFlg: "N",
    ...buildSelectorParams(selectors),
  });

  const root = payload.GET_STATS_DATA;
  const statisticalData =
    isRecord(root) && isRecord(root.STATISTICAL_DATA) ? root.STATISTICAL_DATA : undefined;
  const tableInfo =
    statisticalData && isRecord(statisticalData.TABLE_INF)
      ? statisticalData.TABLE_INF
      : undefined;
  const dataInf =
    statisticalData && isRecord(statisticalData.DATA_INF) ? statisticalData.DATA_INF : undefined;
  const values = asArray<unknown>(dataInf?.VALUE).filter(isRecord) as EStatValueRow[];

  return {
    title: textFromField(tableInfo?.TITLE),
    statisticsName: textFromField(tableInfo?.STATISTICS_NAME),
    values,
  };
}
