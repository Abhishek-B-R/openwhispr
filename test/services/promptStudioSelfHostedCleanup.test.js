const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

function findRunButton(node) {
  if (!node) return null;
  if (Array.isArray(node)) {
    for (const child of node) {
      const match = findRunButton(child);
      if (match) return match;
    }
    return null;
  }
  if (node.props?.className === "w-full" && typeof node.props.onClick === "function") return node;
  return findRunButton(node.props?.children);
}

// The test tab prints the model and the provider in the only two dir="ltr" labels.
function findLtrLabels(node, found = []) {
  if (!node) return found;
  if (Array.isArray(node)) {
    for (const child of node) findLtrLabels(child, found);
    return found;
  }
  if (node.props?.dir === "ltr" && typeof node.props.children === "string") {
    found.push(node.props.children);
  }
  findLtrLabels(node.props?.children, found);
  return found;
}

const baseState = {
  uiLanguage: "en",
  useCleanupModel: true,
  cleanupMode: "self-hosted",
  cleanupModel: "gemini-3.8-flash-high",
  cleanupRemoteUrl: "http://192.168.1.20:8080",
  cleanupCloudBaseUrl: "",
  cleanupProvider: "openai",
  useDictationAgent: false,
  dictationAgentMode: "openwhispr",
  dictationAgentProvider: "openwhispr",
  dictationAgentModel: "",
  useDictationTranslation: false,
  translationMode: "openwhispr",
  translationProvider: "openwhispr",
  translationModel: "",
  translationRemoteUrl: "",
  translationTargetLanguage: "",
  customPrompts: { cleanup: "", dictationAgent: "", translate: "" },
  preferredLanguage: "en",
  cleanupDisableThinking: false,
  setCustomPrompt() {},
};

test("Prompt Studio cleanup test follows self-hosted mode", async (t) => {
  const { createServer } = await import("vite");
  const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), "openwhispr-prompt-studio-lan-test-"));
  const vite = await createServer({
    root: path.resolve(__dirname, "../../src"),
    cacheDir,
    configFile: false,
    appType: "custom",
    logLevel: "silent",
    optimizeDeps: { noDiscovery: true },
    ssr: { noExternal: true },
    plugins: [
      {
        name: "prompt-studio-self-hosted-dependencies",
        enforce: "pre",
        resolveId(source) {
          const modules = {
            react: "react",
            "react/jsx-dev-runtime": "jsx-runtime",
            "react/jsx-runtime": "jsx-runtime",
            "react-i18next": "i18n",
            "zustand/react/shallow": "zustand-shallow",
            "./button": "button",
            "./textarea": "textarea",
            "../icons": "icons",
            "./dialog": "dialog",
          };
          if (modules[source]) return `\0ps-lan-${modules[source]}`;
          if (source.endsWith("/hooks/useDialogs")) return "\0ps-lan-dialogs";
          if (source.endsWith("/hooks/usePolicy")) return "\0ps-lan-policy";
          if (source.endsWith("/utils/agentName")) return "\0ps-lan-agent-name";
          if (source.endsWith("/services/ReasoningService")) return "\0ps-lan-reasoning";
          if (source.endsWith("/models/ModelRegistry")) return "\0ps-lan-models";
          if (source.endsWith("/utils/logger")) return "\0ps-lan-logger";
          if (source.endsWith("/config/prompts")) return "\0ps-lan-prompts";
          if (source.endsWith("/stores/settingsStore")) return "\0ps-lan-settings";
          if (source.endsWith("/utils/languageSupport")) return "\0ps-lan-language";
          if (source.endsWith("/utils/snippets")) return "\0ps-lan-snippets";
          if (source.endsWith("/helpers/dictationAgentInference")) return "\0ps-lan-agent";
          if (source.endsWith("/helpers/dictationTranslationInference")) {
            return "\0ps-lan-translation";
          }
          return null;
        },
        load(id) {
          if (id === "\0ps-lan-react") {
            // Open on the test tab; every setter records what it was given.
            return `
              export function useState(initial) {
                const value =
                  initial === "current" ? "test" : typeof initial === "function" ? initial() : initial;
                return [value, (next) => globalThis.__psLan.set.push(next)];
              }
            `;
          }
          if (id === "\0ps-lan-jsx-runtime") {
            return `
              export const Fragment = Symbol.for("ps-lan-fragment");
              export function jsxDEV(type, props, key) { return { type, props, key }; }
              export const jsx = jsxDEV;
              export const jsxs = jsxDEV;
            `;
          }
          if (id === "\0ps-lan-i18n") {
            return `export function useTranslation() { return { t: (key) => key }; }`;
          }
          if (id === "\0ps-lan-zustand-shallow") {
            return `export function useShallow(selector) { return selector; }`;
          }
          if (id === "\0ps-lan-button") return "export function Button() {}";
          if (id === "\0ps-lan-textarea") return "export function Textarea() {}";
          if (id === "\0ps-lan-icons") {
            return `
              export const Eye = () => null;
              export const Edit3 = () => null;
              export const Play = () => null;
              export const Save = () => null;
              export const RotateCcw = () => null;
              export const Copy = () => null;
              export const TestTube = () => null;
              export const AlertTriangle = () => null;
              export const Check = () => null;
            `;
          }
          if (id === "\0ps-lan-dialog") return "export function AlertDialog() {}";
          if (id === "\0ps-lan-dialogs") {
            return `
              export function useDialogs() {
                return {
                  alertDialog: { open: false, title: "", description: "" },
                  showAlertDialog() {},
                  hideAlertDialog() {},
                };
              }
            `;
          }
          if (id === "\0ps-lan-policy") {
            return `
              export function usePolicySnapshot() {
                return { status: "unmanaged", policy: null, appVersion: "1.8.1" };
              }
            `;
          }
          if (id === "\0ps-lan-agent-name") {
            return `export function useAgentName() { return { agentName: "Whisper" }; }`;
          }
          if (id === "\0ps-lan-reasoning") {
            return `
              export default {
                async processText(...args) {
                  globalThis.__psLan.calls.push(args);
                  return "result";
                },
              };
            `;
          }
          if (id === "\0ps-lan-models") {
            // What the real registry does for a model it does not list: a stored
            // custom provider wins, then the id heuristics.
            return `
              export function getModelProvider(modelId) {
                if (globalThis.__psLan.state.cleanupProvider === "custom") return "custom";
                return modelId.includes("gemini") ? "gemini" : "";
              }
            `;
          }
          if (id === "\0ps-lan-logger") {
            return `export default { debug() {}, error() {} };`;
          }
          if (id === "\0ps-lan-prompts") {
            return `
              export function getDefaultPromptText() { return "default prompt"; }
              export function resolvePrompt() { return "resolved prompt"; }
            `;
          }
          if (id === "\0ps-lan-settings") {
            return `
              const state = () => globalThis.__psLan.state;
              export function useSettingsStore(selector) { return selector(state()); }
              useSettingsStore.getState = () => state();
              export function selectPolicyEffectiveSettings(settings) { return settings; }
              export const selectIsCloudCleanupMode = () => false;
              export const selectIsCloudDictationAgentMode = () => false;
              export const selectIsCloudTranslationMode = () => false;
            `;
          }
          if (id === "\0ps-lan-language") {
            return `export function getLanguageLabel(value) { return value; }`;
          }
          if (id === "\0ps-lan-snippets") {
            return `export function getDictionaryHintWords() { return []; }`;
          }
          if (id === "\0ps-lan-agent") {
            return `export function resolveDictationAgentInference() { return {}; }`;
          }
          if (id === "\0ps-lan-translation") {
            return `export function resolveDictationTranslationInference() { return {}; }`;
          }
          return null;
        },
      },
    ],
    server: { middlewareMode: true },
  });

  t.after(async () => {
    await vite.close();
    fs.rmSync(cacheDir, { recursive: true, force: true });
    delete globalThis.__psLan;
  });

  const { default: PromptStudio } = await vite.ssrLoadModule("/components/ui/PromptStudio.tsx");

  const render = (overrides) => {
    globalThis.__psLan = { state: { ...baseState, ...overrides }, calls: [], set: [] };
    return PromptStudio({ kind: "cleanup" });
  };

  await t.test("labels a self-hosted model by its mode, not its name", () => {
    const labels = findLtrLabels(render({}));
    assert.deepEqual(labels, ["gemini-3.8-flash-high", "Self-hosted"]);
  });

  await t.test("runs a self-hosted test without a model", async () => {
    const rendered = render({ cleanupModel: "" });
    await findRunButton(rendered).props.onClick();
    assert.equal(globalThis.__psLan.calls.length, 1);
    assert.equal(globalThis.__psLan.calls[0][3].inferenceScope, "dictationCleanup");
    assert.ok(!globalThis.__psLan.set.includes("promptStudio.test.noModelSelected"));
  });

  await t.test("asks for the endpoint when self-hosted has none", async () => {
    const rendered = render({ cleanupRemoteUrl: "  " });
    await findRunButton(rendered).props.onClick();
    assert.equal(globalThis.__psLan.calls.length, 0);
    assert.ok(globalThis.__psLan.set.includes("notes.actions.errors.noEndpoint"));
  });

  await t.test("ignores a leftover custom provider in self-hosted mode", async () => {
    const rendered = render({ cleanupProvider: "custom", cleanupCloudBaseUrl: "" });
    await findRunButton(rendered).props.onClick();
    assert.equal(globalThis.__psLan.calls.length, 1);
  });

  await t.test("still names the provider from the model in providers mode", () => {
    const labels = findLtrLabels(render({ cleanupMode: "providers" }));
    assert.deepEqual(labels, ["gemini-3.8-flash-high", "Gemini"]);
  });
});
