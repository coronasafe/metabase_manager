"use client";

import { useEffect, useState } from "react";
import { ServerInput } from "@/components/ServerInput";
import { Toaster, toast } from "react-hot-toast";
import { Card, Dashboard, DatabaseMeta, Field, Server, SyncMapping, SyncStatus, SyncStatusText, Table } from "@/types";
import { exportConfig, findCollectionId, findPath, formatHostUrl, importConfig } from "./utils";
import {
  createMapping,
  getMapping,
  updateMapping,
  createCard,
  cardList,
  createCollection,
  createDashboard,
  dashboardList,
  collectionList,
  clearAllMapping,
} from "./api";

export default function Home() {
  const [sourceServers, setSourceServers] = useState<Server[]>([]);
  const [proceedLoading, setProceedLoading] = useState(false);
  const [destinationServers, setDestinationServers] = useState<Server[]>([]);
  const [syncStatus, setSyncStatus] = useState<SyncStatus[]>([]);
  const [syncLoading, setSyncLoading] = useState(false);
  const [progressBar, setProgressBar] = useState({
    value: 0,
    color: "bg-[#0c80cec5]",
  });

  const [settings, setSettings] = useState({
    refreshMapping: false,
    syncMarkdown: false,
    excludeRegex: "",
  });

  useEffect(() => {
    const checkedSyncQues = syncStatus.filter((s) => s.checked);
    const completedSyncStatus = checkedSyncQues.filter((s) => s.status === "success" || s.status === "error");
    setProgressBar((progressBar) => ({
      ...progressBar,
      value: (completedSyncStatus.length / checkedSyncQues.length) * 100,
      color: completedSyncStatus.some((s) => s.status === "error") ? "bg-red-400" : "bg-[#0c80cec5]",
    }));
  }, [syncStatus]);

  async function syncDashboard(
    sourceServer: Server,
    destinationServer: Server,
    dashboard: Dashboard,
    syncID: string,
    mappedDashID?: number
  ) {
    setSyncStatus((syncStatus) => syncStatus.map((s) => (s.id === syncID ? { ...s, status: "syncing" } : s)));
    try {
      const destCollectionID = await toast.promise(
        mirrorCollectionTree(
          sourceServer,
          destinationServer,
          sourceServer.collection,
          destinationServer.collection,
          dashboard.collection_id?.toString()
        ),
        {
          loading: "Syncing collection tree...",
          success: "Collection tree synced!",
          error: (err) => {
            return "Failed to sync collection tree: " + err.message;
          },
        }
      );

      const res = await toast.promise(
        createDashboard(
          sourceServer.host,
          destinationServer.host,
          sourceServer.session_token,
          destinationServer.session_token,
          destinationServer.database,
          dashboard,
          destCollectionID.toString(),
          mappedDashID,
          settings.syncMarkdown,
          settings.excludeRegex
        ),
        {
          loading: "Syncing dashboard...",
          success: "Dashboard synced!",
          error: (err) => {
            return "Failed to sync dashboard: " + err.message;
          },
        }
      );
      if (res["error"]) {
        throw new Error(res["error"]);
      }
      setSyncStatus((syncStatus) => syncStatus.map((s) => (s.id === syncID ? { ...s, status: "success" } : s)));
    } catch (e: any) {
      setSyncStatus((syncStatus) => syncStatus.map((s) => (s.id === syncID ? { ...s, status: "error" } : s)));
    }
  }

  async function getDestMapping(
    source_id: string,
    source_schema: DatabaseMeta,
    destination_schema: DatabaseMeta,
    type: "table" | "field" = "table",
    source_table_id?: string
  ) {
    if (type === "table") {
      const sourceTable = source_schema?.tables?.find((table) => table?.id == parseInt(source_id));
      if (!sourceTable) {
        toast.error("Table " + source_id + " not found in source schema");
        return;
      }
      const destinationTable = destination_schema?.tables?.find((table) => table.name == sourceTable?.name);
      if (!destinationTable) {
        toast.error("Table " + sourceTable?.name + " not found in destination schema");
        return;
      }
      return destinationTable?.id;
    } else {
      let sourceField: Field | undefined;
      let sourceTable: Table | undefined;
      if (source_table_id) {
        sourceTable = source_schema?.tables?.find((table) => table?.id == parseInt(source_table_id));
        sourceField = sourceTable?.fields?.find((field) => field?.id === parseInt(source_id));
      } else {
        sourceField = source_schema?.tables
          ?.flatMap((table) => table?.fields)
          .find((field) => field?.id === parseInt(source_id));
        sourceTable = source_schema?.tables?.find((table) => table?.id === sourceField?.table_id);
      }
      if (!sourceField) {
        toast.error("Field " + source_id + " not found in source schema");
        return;
      }
      const destTable = destination_schema?.tables?.find((table) => table.name == sourceTable?.name);
      const destinationField = destTable?.fields?.find((field) => field?.name === sourceField?.name);
      if (!destinationField) {
        toast.error("Field " + sourceField?.name + " not found in destination schema");
        return;
      }
      return destinationField?.id;
    }
  }

  async function mapJoins(
    joins: any,
    source_schema: DatabaseMeta,
    destination_schema: DatabaseMeta,
    original_query: any
  ) {
    const mapped_joins = [];
    const original_table_id = original_query["source-table"];
    for (const join of joins) {
      const secondary_table: string = join["source-table"];

      const mapped_secondary_table = await getDestMapping(
        secondary_table,
        source_schema,
        destination_schema,
        "table",
        original_table_id
      );
      if (typeof join.condition[1][1] == "object") {
        mapped_joins.push({
          ...join,
          "source-table": mapped_secondary_table,
          condition: [
            join.condition[0],

            [
              join.condition[1][0],
              [
                join.condition[1][1][0],
                await getDestMapping(
                  join.condition[1][1][1],
                  source_schema,
                  destination_schema,
                  "field",
                  original_table_id
                ),
                join.condition[1][1][2],
              ],
              [
                join.condition[1][2][0],
                await getDestMapping(
                  join.condition[1][2][1],
                  source_schema,
                  destination_schema,
                  "field",
                  secondary_table
                ),
                join.condition[1][2][2],
              ],
            ],

            [
              join.condition[2][0],
              [
                join.condition[2][1][0],
                await getDestMapping(
                  join.condition[2][1][1],
                  source_schema,
                  destination_schema,
                  "field",
                  original_table_id
                ),
                join.condition[2][1][2],
              ],
              [
                join.condition[2][2][0],
                await getDestMapping(
                  join.condition[2][2][1],
                  source_schema,
                  destination_schema,
                  "field",
                  secondary_table
                ),
                join.condition[2][2][2],
              ],
            ],
          ],
        });
      } else {
        mapped_joins.push({
          ...join,
          "source-table": mapped_secondary_table,
          condition: [
            join.condition[0],

            [
              join.condition[1][0],
              await getDestMapping(join.condition[1][1], source_schema, destination_schema, "field", original_table_id),
              join.condition[1][2],
            ],

            [
              join.condition[2][0],
              await getDestMapping(join.condition[2][1], source_schema, destination_schema, "field", secondary_table),
              join.condition[2][2],
            ],
          ],
        });
      }
    }
    return mapped_joins;
  }

  async function transformQuery(
    query: any,
    sourceSrv: Server,
    destSrv: Server,
    source_schema?: DatabaseMeta,
    destination_schema?: DatabaseMeta,
    source_table?: string,
    original_query?: any
  ): Promise<any> {
    if (!source_schema || !destination_schema) return query;
    if (Array.isArray(query)) {
      if (Array.isArray(query) && query[0] === "field") {
        const mappedID = await getDestMapping(query[1], source_schema, destination_schema, "field", source_table);
        const rest_elements = query.slice(2);
        if (Array.isArray(rest_elements)) {
          for (let i = 0; i < rest_elements.length; i++) {
            if (Array.isArray(rest_elements[i])) {
              rest_elements[i] = await transformQuery(
                rest_elements[i],
                sourceSrv,
                destSrv,
                source_schema,
                destination_schema,
                source_table,
                original_query
              );
            } else if (typeof rest_elements[i] === "object" && rest_elements[i] !== null) {
              rest_elements[i] = await transformQuery(
                rest_elements[i],
                sourceSrv,
                destSrv,
                source_schema,
                destination_schema,
                source_table,
                original_query
              );
            }
          }
        }
        return ["field", mappedID].concat(rest_elements);
      } else {
        return await Promise.all(
          query.map(async (item, _) => {
            if (Array.isArray(item) && item[0] === "field") {
              const mappedID = await getDestMapping(item[1], source_schema, destination_schema, "field", source_table);
              const rest_elements = item.slice(2);
              if (Array.isArray(rest_elements)) {
                for (let i = 0; i < rest_elements.length; i++) {
                  if (Array.isArray(rest_elements[i])) {
                    rest_elements[i] = await transformQuery(
                      rest_elements[i],
                      sourceSrv,
                      destSrv,
                      source_schema,
                      destination_schema,
                      source_table,
                      original_query
                    );
                  } else if (typeof rest_elements[i] === "object" && rest_elements[i] !== null) {
                    rest_elements[i] = await transformQuery(
                      rest_elements[i],
                      sourceSrv,
                      destSrv,
                      source_schema,
                      destination_schema,
                      source_table,
                      original_query
                    );
                  }
                }
              }
              return ["field", mappedID].concat(rest_elements);
            }
            return await transformQuery(
              item,
              sourceSrv,
              destSrv,
              source_schema,
              destination_schema,
              source_table,
              original_query
            );
          })
        );
      }
    } else if (typeof query === "object" && query !== null) {
      const newQuery: {
        [key: string]: any;
      } = {};
      for (const key in query) {
        if (key === "joins") {
          newQuery["joins"] = await mapJoins(query[key], source_schema, destination_schema, original_query);
        } else if (key === "source-table") {
          const mappedID = await getDestMapping(query[key], source_schema, destination_schema, "table", query[key]);
          newQuery["source-table"] = mappedID;
        } else if (key === "source-field") {
          newQuery["source-field"] = await getDestMapping(
            query[key],
            source_schema,
            destination_schema,
            "field",
            source_table
          );
        } else if (key.startsWith("#") && query[key]?.["type"] === "card") {
          const question_details = sourceSrv?.questions?.find((q) => q.id == query[key]?.["card-id"]) || -1;
          if (!question_details || question_details === -1) {
            toast.error(
              "Failed to find needed depedency at source " +
                query[key]?.["display-name"] +
                " in " +
                sourceSrv.host +
                ". Make sure the referenced card exists in source collection."
            );
            return query;
          }
          const mappedCardID = await getMapping(
            question_details?.entity_id || "-1",
            "card",
            sourceSrv.host,
            destSrv.host
          );
          const destCardDetails =
            destSrv?.questions?.find((q) => q.entity_id == mappedCardID?.[0]?.["destinationCardID"]) || -1;
          if (!mappedCardID || mappedCardID.length == 0 || !destCardDetails || destCardDetails === -1) {
            toast.error(
              "Failed to find needed depedency " +
                query[key]?.["display-name"] +
                " in " +
                destSrv.host +
                ". Please sync the card first."
            );
            return query;
          }
          newQuery[key] = {
            ...query[key],
            "card-id": destCardDetails.id,
            name: `#${destCardDetails.id}-${query[key]?.["name"].split("-").slice(1).join("-")}`,
            "display-name": `#${destCardDetails.id} ${query[key]?.["display-name"].split(" ").slice(1).join(" ")}`,
          };
        } else {
          newQuery[key] = await transformQuery(
            query[key],
            sourceSrv,
            destSrv,
            source_schema,
            destination_schema,
            source_table,
            original_query
          );
        }
      }
      return newQuery;
    } else {
      return query;
    }
  }

  async function mirrorCollectionTree(
    source_server: Server,
    destination_server: Server,
    source_root_id: string | undefined,
    destination_root_id: string | undefined,
    source_card_collection_id: string | undefined
  ) {
    const sourcePath = findPath(source_server.collectionTree, source_card_collection_id, source_root_id);
    const destPath = findPath(destination_server.collectionTree, destination_root_id, destination_root_id);
    const destCollectionTree = await collectionList(destination_server.host, destination_server.session_token);

    let lastId = parseInt(destination_root_id ?? "-1");
    for (let i = 1; i < sourcePath.length; i++) {
      const collectionName = sourcePath[i];
      const destCollectionID = findCollectionId(destCollectionTree, collectionName, destPath[i - 1]);
      if (destCollectionID == null) {
        const parentID = lastId == -1 ? findCollectionId(destCollectionTree, destPath[i - 1]) : lastId;
        const newCollectionTree = await createCollection(
          destination_server.host,
          destination_server.session_token,
          collectionName,
          parentID
        );
        lastId = newCollectionTree.id;
        destPath.push(collectionName);
      } else lastId = destCollectionID;
    }
    return lastId;
  }

  async function syncQuestion(
    sourceServer: Server,
    destinationServer: Server,
    question: Card,
    syncID: string,
    mappedQuesID?: number
  ) {
    setSyncStatus((syncStatus) => syncStatus.map((s) => (s.id === syncID ? { ...s, status: "syncing" } : s)));
    try {
      question.dataset_query.database = destinationServer.database;

      const question_query = { ...question.dataset_query };
      if (question_query.type != "native") {
        question_query.query = await transformQuery(
          question_query.query,
          sourceServer,
          destinationServer,
          sourceServer.schema,
          destinationServer.schema,
          undefined,
          question.dataset_query.query
        );
      } else {
        const mappedQuery = { ...question_query.native };

        for (const key in question_query.native) {
          if (key == "query") continue;
          mappedQuery[key] = await transformQuery(
            mappedQuery[key],
            sourceServer,
            destinationServer,
            sourceServer.schema,
            destinationServer.schema,
            undefined,
            question.dataset_query.native[key]
          );
        }

        for (let key in mappedQuery?.["template-tags"]) {
          if (mappedQuery?.["template-tags"].hasOwnProperty(key)) {
            if (
              mappedQuery["template-tags"][key].hasOwnProperty("name") &&
              key !== mappedQuery["template-tags"][key].name
            ) {
              mappedQuery["template-tags"][mappedQuery["template-tags"][key].name] = mappedQuery["template-tags"][key];
              mappedQuery.query = mappedQuery.query.replace(
                new RegExp(`{{${key}}`, "g"),
                `{{${mappedQuery["template-tags"][mappedQuery["template-tags"][key].name].name}}`
              );
              delete mappedQuery["template-tags"][key];
            }
          }
        }

        question_query.native = mappedQuery;
      }

      const destCollectionID = await toast.promise(
        mirrorCollectionTree(
          sourceServer,
          destinationServer,
          sourceServer.collection,
          destinationServer.collection,
          question.collection_id?.toString()
        ),
        {
          loading: "Syncing collection tree...",
          success: "Collection tree synced!",
          error: (err) => {
            return "Failed to sync collection tree: " + err.message;
          },
        }
      );

      const res = await toast.promise(
        createCard(
          sourceServer.host,
          destinationServer.host,
          sourceServer.session_token,
          destinationServer.session_token,
          destinationServer.database,
          { ...question, dataset_query: question_query },
          destCollectionID?.toString(),
          mappedQuesID
        ),
        {
          loading: "Syncing question...",
          success: "Card synced!",
          error: (err) => {
            return "Failed to sync question: " + err.message;
          },
        }
      );
      if (res["error"]) {
        throw new Error(res["error"]);
      }
      setSyncStatus((syncStatus) => syncStatus.map((s) => (s.id === syncID ? { ...s, status: "success" } : s)));
    } catch (e: any) {
      toast.error(e.message);
      console.error(e);
      setSyncStatus((syncStatus) => syncStatus.map((s) => (s.id === syncID ? { ...s, status: "error" } : s)));
    }
  }

  function getSyncStatusTextColor(status: SyncStatusText): string | undefined {
    switch (status) {
      case "in-sync":
        return "text-blue-500";
      case "outdated":
        return "text-orange-500";
      case "ready":
        return "text-gray-500";
      case "syncing":
        return "text-yellow-500";
      case "success":
        return "text-green-500";
      case "error":
        return "text-red-500";
      default:
        return undefined;
    }
  }

  async function getQuestions(
    host: string,
    session_token: string,
    start_collection_id?: string,
    collectionTree?: any,
    collection_ids?: string[]
  ): Promise<any> {
    const allQuestions = await cardList(host, session_token);
    const allDashboards = await dashboardList(host, session_token);
    if (collection_ids && collection_ids[0] != "-1") {
      const collectionQuestions = allQuestions.filter((question: Card) =>
        collection_ids.includes(question?.collection_id?.toString() || "-1")
      );
      const collectionDashboards = allDashboards.filter((dashboard: Dashboard) =>
        collection_ids.includes(dashboard?.collection_id?.toString() || "-1")
      );
      return [
        ...collectionDashboards.map((dashboard: Dashboard) => ({
          ...dashboard,
          entity_type: "dashboard",
          collection_path: findPath(collectionTree, dashboard?.collection_id?.toString(), start_collection_id),
        })),
        ...collectionQuestions.map((question: Card) => ({
          ...question,
          entity_type: "question",
          collection_path: findPath(collectionTree, question?.collection_id?.toString(), start_collection_id),
        })),
      ];
    }
    return [...allDashboards, ...allQuestions];
  }

  function findChildren(jsonObj: any, startId?: string, result: string[] = [], started = false) {
    if (Array.isArray(jsonObj)) {
      for (const item of jsonObj) {
        findChildren(item, startId, result);
      }
    } else if (typeof jsonObj === "object") {
      if (jsonObj["id"] == startId || started) {
        result.push(jsonObj["id"].toString());
        const children = jsonObj["children"];
        if (children) {
          for (const child of children) {
            findChildren(child, startId, result, true);
          }
        }
      } else {
        const children = jsonObj["children"];
        if (children) {
          for (const child of children) {
            findChildren(child, startId, result);
          }
        }
      }
    }
    return result;
  }

  function checkChangesRequired(source_question: Card | Dashboard, destination_question: Card | Dashboard) {
    if (source_question.description !== destination_question.description) return true;
    if (source_question?.display !== destination_question?.display) return true;
    if (source_question.name !== destination_question.name) return true;

    return false;
  }

  async function getExistingCollectionPath(
    source_server: Server,
    destination_server: Server,
    source_root_id: string | undefined,
    destination_root_id: string | undefined,
    source_card_collection_id: string | undefined
  ) {
    const sourcePath = findPath(source_server.collectionTree, source_card_collection_id, source_root_id);
    const destPath = findPath(destination_server.collectionTree, destination_root_id, destination_root_id);
    const destCollectionTree = await collectionList(destination_server.host, destination_server.session_token);

    let lastId = parseInt(destination_root_id ?? "-1");
    for (let i = 1; i < sourcePath.length; i++) {
      const collectionName = sourcePath[i];
      const destCollectionID = findCollectionId(destCollectionTree, collectionName, destPath[i - 1]);

      if (destCollectionID == null) {
        return -1;
      } else {
        lastId = destCollectionID;
        destPath.push(collectionName);
      }
    }
    return lastId;
  }

  async function loadSyncData(): Promise<void> {
    setSyncLoading(true);
    if (settings.refreshMapping) {
      const allServers = [...sourceServers, ...destinationServers];
      await clearAllMapping(allServers.map((s) => s.host));
    }
    const updatedSourceServers = await Promise.all(
      sourceServers.map(async (s) => ({
        ...s,
        questions: await getQuestions(
          s.host,
          s.session_token,
          s.collection?.toString(),
          s.collectionTree,
          findChildren(s.collectionTree, s.collection?.toString())
        ),
      }))
    );
    setSourceServers(updatedSourceServers);

    const sourceQuestions = updatedSourceServers.flatMap((s) => s.questions);
    const sourceQuestionNames = sourceQuestions.map((q) => q.name);
    const duplicateSourceQuestionNames = sourceQuestionNames.filter(
      (name, index) => sourceQuestionNames.indexOf(name) !== index
    );
    if (duplicateSourceQuestionNames.length > 0) {
      toast.error("Please make sure there are no questions with same name in source instances", {
        duration: 60000,
      });
      toast.error(
        "There are questions with same name in source instances: [" + duplicateSourceQuestionNames.join(",  ") + "]",
        {
          duration: 60000,
        }
      );

      setSyncLoading(false);
      return;
    }

    const updatedDestServers = await Promise.all(
      destinationServers.map(async (s) => ({
        ...s,
        questions: await getQuestions(
          s.host,
          s.session_token,
          s.collection?.toString(),
          s.collectionTree,
          findChildren(s.collectionTree, s.collection?.toString())
        ),
      }))
    );
    setDestinationServers(updatedDestServers);

    const syncStatus: any[] = [];
    const questions_cache = new Map<string, any>();
    const dashboard_cards_cache = new Map<string, any>();

    for (const server of updatedSourceServers) {
      for (const question of server.questions ?? []) {
        for (const destServer of updatedDestServers) {
          let destQuestions = questions_cache.get(destServer.host);
          if (!destQuestions) {
            destQuestions = await cardList(destServer.host, destServer.session_token);
            questions_cache.set(destServer.host, destQuestions);
          }

          let destDashboards = dashboard_cards_cache.get(destServer.host);
          if (!destDashboards) {
            destDashboards = await dashboardList(destServer.host, destServer.session_token);
            dashboard_cards_cache.set(destServer.host, destDashboards);
          }

          let syncedIDs: string[] = [];
          if (question.entity_type === "dashboard")
            syncedIDs = (
              await getMapping(question?.id?.toString() || "-1", "dashboard", server.host, destServer.host)
            ).map((d: SyncMapping) => d.destinationCardID);
          else
            syncedIDs = (await getMapping(question.entity_id || "-1", "card", server.host, destServer.host)).map(
              (d: SyncMapping) => d.destinationCardID
            );
          let mapped_ques;
          if (question.entity_type === "dashboard")
            mapped_ques = (destServer?.questions as Dashboard[]).find((q: any) =>
              syncedIDs.includes(q.id?.toString() || "-1")
            );
          else
            mapped_ques = (destServer?.questions as Card[]).find((q: any) => syncedIDs.includes(q.entity_id || "-1"));

          if (!mapped_ques) {
            const destCollectionID = await getExistingCollectionPath(
              server,
              destServer,
              server.collection,
              destServer.collection,
              question.collection_id?.toString()
            );
            if (destCollectionID != -1) {
              if (question.entity_type === "dashboard") {
                const destDashboard = destDashboards.find(
                  (q: any) => q.name === question.name && q.collection_id?.toString() === destCollectionID?.toString()
                );
                if (destDashboard) {
                  mapped_ques = destDashboard;
                  if (syncedIDs.length == 0) {
                    await createMapping(
                      question.id.toString() || "-1",
                      destDashboard.id.toString() || "-1",
                      server.host,
                      destServer.host,
                      "dashboard"
                    );
                  } else {
                    await updateMapping(
                      question.id.toString() || "-1",
                      destDashboard.id.toString() || "-1",
                      destServer.host,
                      "dashboard"
                    );
                  }
                }
              } else {
                const destQuestion = destQuestions.find(
                  (q: any) => q.name === question.name && q.collection_id?.toString() === destCollectionID?.toString()
                );
                if (destQuestion) {
                  mapped_ques = destQuestion;
                  if (syncedIDs.length == 0) {
                    await createMapping(
                      question.entity_id || "-1",
                      destQuestion.entity_id || "-1",
                      server.host,
                      destServer.host,
                      "card"
                    );
                  } else {
                    await updateMapping(
                      question.entity_id || "-1",
                      destQuestion.entity_id || "-1",
                      destServer.host,
                      "card"
                    );
                  }
                }
              }
            }
          }

          const is_dependent =
            question?.entity_type === "question" &&
            question?.dataset_query?.type === "native" &&
            Object.keys(question?.dataset_query?.native?.["template-tags"] || {}).some((key) => key.startsWith("#"));

          const is_excluded = destServer.excludedIDs?.includes(question?.entity_id);

          syncStatus.push({
            id: `${destServer.host}-${question.name}-${question.entity_id ?? question.id}`,
            source_server: server,
            destination_server: destServer,
            question,
            mapped_ques,
            status: mapped_ques
              ? checkChangesRequired(question, mapped_ques)
                ? "outdated"
                : "in-sync"
              : ("ready" as SyncStatusText),
            checked: false,
            entity_type: question.entity_type,
            collection_path: question.collection_path,
            is_dependent,
            is_excluded,
          });
        }
      }
    }

    setSyncStatus(syncStatus);
    setSyncLoading(false);
  }

  async function startSync() {
    setSyncLoading(true);
    setProgressBar({ value: 0, color: "bg-[#0c80cec5]" });
    const checkedSyncQues = syncStatus
      .filter((s) => s.checked)
      .sort((a, b) => {
        if (a.entity_type === "dashboard" && b.entity_type !== "dashboard") {
          return 1;
        } else if (a.entity_type !== "dashboard" && b.entity_type === "dashboard") {
          return -1;
        } else if (a.is_dependent && !b.is_dependent) {
          return 1;
        } else if (!a.is_dependent && b.is_dependent) {
          return -1;
        } else {
          return a.id.localeCompare(b.id);
        }
      });
    for (const syncData of checkedSyncQues) {
      if (syncData.entity_type === "dashboard")
        await syncDashboard(
          syncData.source_server,
          syncData.destination_server,
          syncData.question as Dashboard,
          syncData.id,
          syncData.mapped_ques?.id
        );
      else
        await syncQuestion(
          syncData.source_server,
          syncData.destination_server,
          syncData.question as Card,
          syncData.id,
          syncData.mapped_ques?.id
        );
    }
    await toast.promise(loadSyncData(), {
      loading: "Refreshing sync data...",
      success: "Sync data refreshed!",
      error: (err) => {
        setProceedLoading(false);
        return "Failed to refresh sync data: " + err.message;
      },
    });
  }

  return (
    <div className="bg-white py-6">
      <Toaster position="top-right" />
      <div className="mx-auto max-w-4xl text-base leading-7 text-gray-700 border rounded-lg border-gray-300 px-8 py-8">
        <p className="text-3xl font-semibold leading-7 text-[#034078] text-center">Metabase Manager</p>
        <p className="mt-3 text text-lg">
          Use Metabase Manager to synchronize your Metabase instance. You can copy question cards from the source
          instances to destination instances.
        </p>
      </div>
      <div className="mt-5 mx-auto max-w-4xl text-base leading-7 text-gray-700 border rounded-lg border-gray-300 px-8 py-6">
        <p className="text-2xl font-bold leading-7 text-zinc-700 text-center">Source Instances</p>
        <ServerInput
          type="source"
          servers={sourceServers}
          onAdd={(server) => {
            setSourceServers((servers) => [...servers, server]);
          }}
          onRemove={(server) => {
            setSourceServers((servers) => servers.filter((s) => s.host !== server.host));
            setSyncStatus([]);
          }}
        />
      </div>
      <div className="mt-5 mx-auto max-w-4xl text-base leading-7 border rounded-lg border-gray-300 px-8 py-6">
        <p className="text-2xl font-bold text-black text-center">Destination Instances</p>
        <ServerInput
          type="destination"
          servers={destinationServers}
          onAdd={(server) => {
            setDestinationServers((servers) => [...servers, server]);
          }}
          onRemove={(server) => {
            setDestinationServers((servers) => servers.filter((s) => s.host !== server.host));
            setSyncStatus([]);
          }}
        />
      </div>
      {syncStatus.length === 0 && (
        <>
          <div className="mt-4 border border-gray-300 rounded-lg max-w-4xl mx-auto">
            <div className="p-4 border-b border-gray-300">
              <p className="text-2xl font-bold text-black text-center">Settings</p>
            </div>
            <div className="p-4">
              <div className="flex justify-between gap-4">
                <div className="flex items-center">
                  <input
                    className="h-4 w-4 text-blue-600 border-gray-300 rounded"
                    id="refreshMapping"
                    type="checkbox"
                    onChange={(e) => {
                      setSettings((settings) => ({ ...settings, refreshMapping: e.target.checked }));
                    }}
                    checked={settings.refreshMapping}
                  />
                  <label className="ml-2 block text-sm text-gray-900" htmlFor="refreshMapping">
                    Refresh Mapping data
                  </label>
                </div>
                <div className="flex items-center">
                  <input
                    className="h-4 w-4 text-blue-600 border-gray-300 rounded"
                    id="syncMarkdown"
                    type="checkbox"
                    onChange={(e) => {
                      setSettings((settings) => ({ ...settings, syncMarkdown: e.target.checked }));
                    }}
                    checked={settings.syncMarkdown}
                  />
                  <label className="ml-2 block text-sm text-gray-900" htmlFor="syncMarkdown">
                    Sync Markdown Cards
                  </label>
                </div>
                <div className={`flex items-center ${settings.syncMarkdown ? "" : "opacity-50"}`}>
                  <input
                    className="border-gray-300 rounded shadow-sm p-2 border h-8 w-80"
                    placeholder="Markdown Cards Blacklist Regex"
                    type="text"
                    onChange={(e) => {
                      setSettings((settings) => ({ ...settings, excludeRegex: e.target.value }));
                    }}
                    value={settings.excludeRegex}
                    disabled={!settings.syncMarkdown}
                  />
                </div>
              </div>
            </div>
          </div>
          <div className="w-full gap-2 mt-5 justify-center grid-cols-6 sm:grid mx-auto max-w-4xl text-base leading-7 border rounded-lg border-gray-300 px-8 py-6">
            <button
              className="w-full col-span-1 rounded-md bg-[#1e6091] px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#168aad] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:bg-gray-700 disabled:text-white"
              onClick={() => {
                exportConfig(sourceServers, destinationServers, settings);
              }}
            >
              Export Setup
            </button>
            <button
              className="w-full col-span-1 rounded-md bg-[#1e6091] px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#168aad] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:bg-gray-700 disabled:text-white my-2 sm:my-0"
              onClick={async () => {
                await importConfig((type, server, settings) => {
                  switch (type) {
                    case "source":
                      setSourceServers((servers) => [...servers, server]);
                      settings && setSettings(settings);
                      break;
                    case "destination":
                      setDestinationServers((servers) => [...servers, server]);
                      settings && setSettings(settings);
                      break;
                  }
                });
              }}
            >
              Import Setup
            </button>
            <button
              disabled={proceedLoading}
              onClick={async () => {
                if (sourceServers.length === 0 || destinationServers.length === 0) {
                  toast.error("Please add at least one source and destination instance");
                  return;
                }
                setProceedLoading(true);
                await toast.promise(loadSyncData(), {
                  loading: "Loading sync data...",
                  success: "Sync data loaded!",
                  error: (err) => {
                    setProceedLoading(false);
                    return "Failed to load sync data: " + err.message;
                  },
                });
                setProceedLoading(false);
              }}
              className="w-full col-span-4 rounded-md bg-[#1e6091] px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#168aad] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:bg-gray-700 disabled:text-white"
            >
              Proceed
            </button>
          </div>
        </>
      )}
      {syncStatus.length > 0 && (
        <div className="mt-5 justify-center flex flex-col mx-auto max-w-6xl text-base leading-7 border rounded-lg border-gray-300 px-8 py-6">
          <div className="relative w-full bg-gray-200 rounded mb-4">
            <div
              className={`relative top-0 h-4 rounded progress-bar overflow-hidden ${progressBar.color} ${
                progressBar.value < 100 && "progress-bar-animate"
              }`}
              style={{ width: `${progressBar.value}%` }}
            ></div>
          </div>
          <div className="relative overflow-x-auto border border-gray-300 rounded-md mb-4">
            <table className="w-full text-sm text-left text-gray-500">
              <thead className="text-xs text-gray-700 uppercase bg-gray-50">
                <tr>
                  <th scope="col" className="p-4 ">
                    <div className="flex items-center">
                      <input
                        id="checkbox-all"
                        type="checkbox"
                        checked={syncStatus.every((s) => s.checked || s.is_excluded)}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setSyncStatus((syncStatus) =>
                            syncStatus.map((s) => {
                              if (!s.is_excluded) return { ...s, checked };
                              else return s;
                            })
                          );
                        }}
                        className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
                      />
                      <label htmlFor="checkbox-all" className="sr-only">
                        checkbox
                      </label>
                    </div>
                  </th>
                  <th scope="col" className="py-3 px-2">
                    Source
                  </th>
                  <th scope="col" className="py-3 px-2">
                    Destination
                  </th>
                  <th scope="col" className="py-3 px-2">
                    Card
                  </th>
                  <th scope="col" className="py-3 px-2">
                    Path
                  </th>
                  <th scope="col" className="py-3 px-2">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {[...syncStatus]
                  .sort((a, b) => {
                    if (a.entity_type === "dashboard" && b.entity_type !== "dashboard") {
                      return 1;
                    } else if (a.entity_type !== "dashboard" && b.entity_type === "dashboard") {
                      return -1;
                    } else if (a.is_dependent && !b.is_dependent) {
                      return 1;
                    } else if (!a.is_dependent && b.is_dependent) {
                      return -1;
                    } else {
                      return a.id.localeCompare(b.id);
                    }
                  })
                  .map((status: SyncStatus, _index: number) => (
                    <tr
                      key={status.id + status.entity_type + (status.question.entity_id ?? status.question.id)}
                      className="bg-white border-b hover:bg-gray-50"
                      onClick={() => {
                        if (status.is_excluded) return;
                        setSyncStatus((syncStatus) =>
                          syncStatus.map((s) => (s.id === status.id ? { ...s, checked: !s.checked } : s))
                        );
                      }}
                    >
                      <td className="w-4 p-4">
                        <div className="flex items-center">
                          <input
                            id={`checkbox-table-${status.id}-${status.entity_type}-${
                              status.question.entity_id ?? status.question.id
                            }`}
                            type="checkbox"
                            checked={status.checked}
                            disabled={status.is_excluded}
                            onChange={(e) => {
                              if (status.is_excluded) return;
                              const checked = (e.target as HTMLInputElement).checked;
                              setSyncStatus((syncStatus) =>
                                syncStatus.map((s) => (s.id === status.id ? { ...s, checked } : s))
                              );
                            }}
                            className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
                          />
                          <label
                            htmlFor={`checkbox-table-${status.id}-${status.entity_type}-${
                              status.question.entity_id ?? status.question.id
                            }`}
                            className="sr-only"
                          >
                            checkbox
                          </label>
                        </div>
                      </td>
                      <td scope="row" className="py-4 px-2 font-medium text-gray-900">
                        {formatHostUrl(status.source_server.host)}
                      </td>
                      <td scope="row" className="py-4 px-2 font-medium text-gray-900">
                        {formatHostUrl(status.destination_server.host)}
                      </td>
                      <td scope="row" className="py-4 px-2 font-medium text-gray-900">
                        {status.question.name}{" "}
                        <p className="text-xs text-gray-500">
                          ({status.entity_type}) ({status.question.entity_id ?? status.question.id}){" "}
                          {status.is_dependent && "(dependent)"} {status.is_excluded && "(excluded)"}
                        </p>
                      </td>
                      <td scope="row" className="py-2 px-2 text-gray-800 text-[12px]">
                        {status.collection_path?.join("/")}
                      </td>
                      <td
                        scope="row"
                        className={`px-2 py-4 font-medium capitalize ${
                          status.is_excluded ? "text-orange-500" : getSyncStatusTextColor(status.status)
                        } whitespace-nowrap`}
                      >
                        {status.is_excluded ? "Excluded" : status.status}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          <button
            type="button"
            onClick={startSync}
            disabled={syncLoading || syncStatus.every((s) => !s.checked)}
            className="rounded-md bg-[#1e6091] px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#168aad] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:bg-gray-700 disabled:text-white"
          >
            Syncronize
          </button>
        </div>
      )}
    </div>
  );
}
