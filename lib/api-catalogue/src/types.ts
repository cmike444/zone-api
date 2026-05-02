export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface Param {
  name: string;
  in: "path" | "query" | "header";
  required: boolean;
  type: string;
  description: string;
}

export interface Endpoint {
  method: HttpMethod;
  path: string;
  summary: string;
  description: string;
  params: Param[];
  exampleResponse: unknown;
  auth: boolean;
  successCode?: number;
  responseContentType?: string;
}

export interface Category {
  id: string;
  title: string;
  description: string;
  endpoints: Endpoint[];
}

export interface WsEvent {
  type: string;
  description: string;
  payload: unknown;
}

export interface WsStream {
  path: string;
  description: string;
  auth: boolean;
  events: WsEvent[];
}

export interface McpTool {
  name: string;
  description: string;
  params: { name: string; type: string; required: boolean; description: string }[];
  returns: string;
  hints: { readOnly: boolean; destructive: boolean };
}
