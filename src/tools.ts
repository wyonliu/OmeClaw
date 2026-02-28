import { readFileSync, writeFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { spawn } from "node:child_process";
import type { ToolDef } from "./llm.js";

export interface Tool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute: (args: Record<string, unknown>) => Promise<string>;
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]*>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}

function parseBingResults(html: string): string[] {
  const results: string[] = [];
  const blockPattern = /<li class="b_algo"[\s\S]*?<\/li>/g;
  let block;
  while ((block = blockPattern.exec(html)) !== null && results.length < 8) {
    const linkPattern = /<a[^>]*href="(https?:\/\/[^"]*)"[^>]*>([\s\S]*?)<\/a>/g;
    let bestTitle = "";
    let bestUrl = "";
    let m;
    while ((m = linkPattern.exec(block[0])) !== null) {
      const text = stripHtml(m[2]);
      const hasUrl = /https?:\/\//.test(text) || /\w+\.com/.test(text.split(/\s/)[0]);
      if (text.length > bestTitle.length && !hasUrl && text.length > 5) {
        bestTitle = text;
        bestUrl = m[1];
      }
    }
    // Fallback: extract first meaningful link URL even if title parsing failed
    if (!bestUrl) {
      const firstLink = block[0].match(/<a[^>]*href="(https?:\/\/[^"]*)"[^>]*>/);
      if (firstLink) bestUrl = firstLink[1];
    }
    if (!bestUrl) continue;
    // Extract snippet from <p> tag
    const snippetMatch = block[0].match(/<p[^>]*>([\s\S]*?)<\/p>/);
    const snippet = snippetMatch ? stripHtml(snippetMatch[1]) : "";
    // If no good title found, use snippet beginning as title
    if (!bestTitle) bestTitle = snippet.slice(0, 80) || "Untitled";
    results.push(`${bestTitle}\n${snippet}\n${bestUrl}`);
  }
  return results;
}

const SEARCH_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36";

const builtinTools: Tool[] = [
  {
    name: "read_file",
    description: "Read a file's content",
    parameters: { type: "object", properties: { path: { type: "string", description: "File path" } }, required: ["path"] },
    execute: async (args) => {
      const p = String(args.path);
      if (!existsSync(p)) return `File not found: ${p}`;
      const stat = statSync(p);
      if (stat.size > 500_000) return `File too large: ${(stat.size / 1e6).toFixed(1)}MB`;
      return readFileSync(p, "utf-8");
    },
  },
  {
    name: "write_file",
    description: "Write content to a file",
    parameters: { type: "object", properties: { path: { type: "string" }, content: { type: "string" } }, required: ["path", "content"] },
    execute: async (args) => { writeFileSync(String(args.path), String(args.content), "utf-8"); return `Written to ${args.path}`; },
  },
  {
    name: "list_dir",
    description: "List directory contents",
    parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"] },
    execute: async (args) => { const p = String(args.path); if (!existsSync(p)) return `Not found: ${p}`; return readdirSync(p).join("\n"); },
  },
  {
    name: "web_fetch",
    description: "Fetch a URL and return its text content",
    parameters: { type: "object", properties: { url: { type: "string", description: "URL to fetch" } }, required: ["url"] },
    execute: async (args) => {
      try {
        const res = await fetch(String(args.url), { headers: { "User-Agent": "OmeClaw/0.3" }, signal: AbortSignal.timeout(15000) });
        const text = await res.text();
        return text.slice(0, 30000);
      } catch (e: any) { return `Error: ${e.message}`; }
    },
  },
  {
    name: "web_search",
    description: "Search the web using Bing and return results",
    parameters: { type: "object", properties: { query: { type: "string", description: "Search query" } }, required: ["query"] },
    execute: async (args) => {
      const q = String(args.query);
      const encoded = encodeURIComponent(q);

      // Strategy 1: Bing (works in China)
      try {
        const res = await fetch(`https://cn.bing.com/search?q=${encoded}&count=10`, {
          headers: { "User-Agent": SEARCH_UA, "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8" },
          signal: AbortSignal.timeout(15000),
          redirect: "follow",
        });
        if (res.ok) {
          const html = await res.text();
          const results = parseBingResults(html);
          if (results.length) return results.join("\n\n---\n\n");
        }
      } catch { /* fall through */ }

      // Strategy 2: Bing international
      try {
        const res = await fetch(`https://www.bing.com/search?q=${encoded}&count=10`, {
          headers: { "User-Agent": SEARCH_UA },
          signal: AbortSignal.timeout(15000),
          redirect: "follow",
        });
        if (res.ok) {
          const html = await res.text();
          const results = parseBingResults(html);
          if (results.length) return results.join("\n\n---\n\n");
        }
      } catch { /* fall through */ }

      // Strategy 3: curl fallback
      try {
        const html = await new Promise<string>((resolve, reject) => {
          const proc = spawn("curl", ["-sL", `https://cn.bing.com/search?q=${encoded}&count=10`,
            "-H", `User-Agent: ${SEARCH_UA}`, "-H", "Accept-Language: zh-CN,zh;q=0.9",
            "--connect-timeout", "10", "--max-time", "15"]);
          let out = "";
          proc.stdout.on("data", (d) => out += d);
          proc.stderr.on("data", () => {});
          proc.on("close", () => resolve(out));
          proc.on("error", reject);
        });
        const results = parseBingResults(html);
        if (results.length) return results.join("\n\n---\n\n");
      } catch { /* fall through */ }

      return `Search failed for "${q}". Try using web_fetch to access a specific URL directly.`;
    },
  },
  {
    name: "shell",
    description: "Run a shell command and return output",
    parameters: { type: "object", properties: { command: { type: "string", description: "Shell command" } }, required: ["command"] },
    execute: async (args) => {
      return new Promise((ok) => {
        const proc = spawn("sh", ["-c", String(args.command)], { timeout: 30000 });
        let out = "";
        proc.stdout.on("data", (d) => (out += d));
        proc.stderr.on("data", (d) => (out += d));
        proc.on("close", (code) => ok(out.slice(0, 10000) || `exit ${code}`));
        proc.on("error", (e) => ok(`Error: ${e.message}`));
      });
    },
  },
];

const registry = new Map<string, Tool>();
builtinTools.forEach(t => registry.set(t.name, t));

export function registerTool(tool: Tool) { registry.set(tool.name, tool); }
export function getTool(name: string) { return registry.get(name); }
export function listTools(): Tool[] { return [...registry.values()]; }

export async function executeTool(name: string, args: Record<string, unknown>): Promise<string> {
  const tool = registry.get(name);
  if (!tool) return `Unknown tool: ${name}`;
  try { return await tool.execute(args); } catch (e: any) { return `Tool "${name}" failed: ${e.message}`; }
}

export function getToolDefs(names: string[]): ToolDef[] {
  return names.map(n => registry.get(n)).filter(Boolean).map(t => ({
    type: "function" as const,
    function: { name: t!.name, description: t!.description, parameters: t!.parameters },
  }));
}
