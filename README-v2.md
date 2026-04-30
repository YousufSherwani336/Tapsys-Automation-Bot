# Org WhatsApp Agent Platform

## v2 Architecture Plan

This document describes a **generic multi-org agent platform** where each organization gets its own isolated WhatsApp-based agent process.

The platform is designed to start with a **Jira capability** and later support other org-specific capabilities, without changing the overall architecture.

---

## 1. Goal

Build a reusable platform where:

- each organization has its **own agent process**
- each organization has its **own WhatsApp session**
- each organization has its **own credentials and configuration**
- each organization enables only the **capabilities/modules** it needs
- shared platform code is reused across all orgs
- org-specific behavior lives inside the org folder

This is **not** a single shared bot with routing logic.
It is a platform for running **many isolated org agents**.

---

## 2. Core Design Principles

### 2.1 One process per org
Each org runs as its own standalone process.

Examples:
- `telenor-agent`
- `paysys-agent`
- `national-bank-agent`

Each process has:
- its own `.env`
- its own WhatsApp session
- its own Pi runtime
- its own enabled modules
- its own in-memory conversation state

There is no central router required.

### 2.2 Shared platform, org-local modules
The architecture is hybrid:

- **shared core platform** handles generic runtime concerns
- **shared module engines** handle reusable capability logic
- **org-local modules** define what is enabled and how that org wants it used

### 2.3 Fail-closed tool exposure
A capability existing in shared code does **not** mean the agent can use it.

A tool is only available if:
1. the org module enables it
2. the loader explicitly registers it into that org's Pi session

If a tool is not registered, Pi cannot use it.

### 2.4 Business agents are not coding agents
These org agents should not be given general coding tools.

Do **not** expose tools like:
- `read`
- `write`
- `edit`
- `bash`
- `grep`
- `find`

The agent should only receive:
- user messages
- preprocessed message content
- explicitly registered business tools

This prevents the model from inspecting code, modifying runtime state, or self-extending.

---

## 3. High-Level Runtime Model

Each org process is self-contained:

```text
┌──────────────────────────────────────────────────────┐
│                Org Agent Process                     │
│                                                      │
│  WhatsApp (Baileys linked device)                    │
│       │                                              │
│       ▼                                              │
│  Message normalization / preprocessing               │
│       │                                              │
│       ▼                                              │
│  Sequential in-memory queue                          │
│       │                                              │
│       ▼                                              │
│  Pi Agent Runtime                                    │
│    - system prompt                                   │
│    - memory                                           │
│    - registered tools                                │
│       │                                              │
│       ▼                                              │
│  Enabled Modules                                     │
│    - starter example: Jira                           │
│    - future modules can be added later               │
└──────────────────────────────────────────────────────┘
```

The same platform code runs for every org, but the loaded modules and credentials differ per org.

---

## 4. Folder Structure

```text
whatsapp-org-agent/
├── src/
│   ├── core/
│   │   ├── bootstrap/                 # startup flow
│   │   ├── module-loader/             # discovers org-local modules and registers tools
│   │   ├── agent-runtime/             # creates Pi session via SDK
│   │   ├── whatsapp/                  # Baileys connection, receiving, replying
│   │   ├── queue/                     # sequential in-memory queue
│   │   └── config/                    # load and validate org config + env
│   │
│   ├── preprocessors/
│   │   ├── voice/                     # optional transcription pipeline
│   │   ├── image/                     # optional OCR/vision pipeline
│   │   └── attachments/               # media download/temp file handling
│   │
│   ├── shared-modules/
│   │   ├── jira-core/                 # shared Jira engine
│   │   └── common/                    # shared helpers, formatting, error handling
│   │
│   └── types/
│
├── orgs/
│   ├── _template/
│   │   ├── config.yaml
│   │   ├── .env.example
│   │   ├── system-prompt.md
│   │   └── modules/
│   │       └── jira/
│   │           ├── manifest.yaml
│   │           ├── prompt.md
│   │           ├── defaults.yaml
│   │           └── vocabulary.yaml
│   │
│   ├── telenor/
│   │   ├── config.yaml
│   │   ├── .env
│   │   ├── system-prompt.md
│   │   ├── wa-session/
│   │   ├── runtime/
│   │   └── modules/
│   │       └── jira/
│   │           ├── manifest.yaml
│   │           ├── prompt.md
│   │           ├── defaults.yaml
│   │           └── vocabulary.yaml
│   │
│   └── another-org/
│       ├── config.yaml
│       ├── .env
│       ├── system-prompt.md
│       ├── wa-session/
│       ├── runtime/
│       └── modules/
│           └── jira/
│               ├── manifest.yaml
│               ├── prompt.md
│               ├── defaults.yaml
│               └── vocabulary.yaml
│
├── pm2.config.js
└── README-v2.md
```

---

## 5. Shared Platform vs Shared Module Engine vs Org Module

There are three important layers.

### 5.1 Platform core
The platform core handles:
- startup
- config loading
- module discovery
- Pi session creation
- WhatsApp connection
- message queue
- preprocessing
- runtime lifecycle

The platform core should know nothing about Jira business rules.

### 5.2 Shared module engine
A shared module engine contains reusable logic for a capability.

For the starter Jira capability, the shared Jira engine contains things like:
- Jira client creation
- create issue
- get issue
- search issues
- update issue
- add comment
- list transitions
- attach file
- normalize Jira errors
- generic tool builders

This is reusable across all orgs.

### 5.3 Org-local module
An org-local module tells the platform how that org wants a shared capability used.

For Jira, the org-local Jira module defines things like:
- whether Jira is enabled for this org
- which Jira tools are exposed
- default project
- common vocabulary and aliases
- org-specific Jira instructions

This is the adapter between the org and the shared module engine.

---

## 6. How Startup Works

Example startup:

```bash
ORG=telenor node dist/main.js
```

### Step 1: load org identity
The platform reads:
- `orgs/telenor/config.yaml`
- `orgs/telenor/.env`
- `orgs/telenor/system-prompt.md`

Now the process knows which org it is starting.

### Step 2: discover org-local modules
The platform scans:

```text
orgs/telenor/modules/*
```

If `jira/` exists there, this org has Jira capability.

### Step 3: load module definitions
For each discovered org module, the platform reads files such as:
- `manifest.yaml`
- `prompt.md`
- `defaults.yaml`
- `vocabulary.yaml`

### Step 4: initialize shared module engines
If the org has a Jira module, the platform initializes the shared Jira engine using that org’s environment variables.

### Step 5: explicitly register only allowed tools
The loader reads the org module manifest and only registers the tool subset allowed for that org.

If a Jira capability exists in shared code but is not enabled in the org manifest, it is **not registered**.

### Step 6: build final system prompt
The Pi system prompt is composed from:
- base platform prompt
- org system prompt
- enabled module prompts

### Step 7: create Pi session
The Pi agent starts with:
- only the tools registered for this org
- only the credentials available to this org
- only the prompts relevant to this org

### Step 8: connect WhatsApp
The process starts Baileys using that org’s own session folder.

---

## 7. How Pi Sees the System

Pi does not know about architectural layers.

Pi only sees:
- its current prompt
- conversation messages
- the registered tool list

That means:
- if a tool is not registered, Pi cannot use it
- if a module is not loaded, Pi does not know it exists
- if a dangerous capability exists in shared code but is not registered, it is unavailable to Pi

This is the core safety model.

---

## 8. Starter Capability: Jira

Jira is the first capability the platform supports.

### 8.1 Shared Jira core
The shared Jira engine is generic. It knows how to communicate with Jira and how to perform supported operations.

It may support many possible Jira operations internally, but that does **not** mean every org gets all of them.

### 8.2 Org Jira module
Each org can choose which Jira behaviors it wants enabled.

Example org module structure:

```text
orgs/<org>/modules/jira/
  manifest.yaml
  prompt.md
  defaults.yaml
  vocabulary.yaml
```

### 8.3 Example purpose of each file

#### `manifest.yaml`
Defines what is enabled for that org.

Conceptually, it answers:
- is Jira enabled?
- which Jira tools are allowed?

#### `prompt.md`
Explains how this org wants Jira handled.

Conceptually, it may describe:
- how the org talks about tickets
- when to ask clarifying questions
- what should be assumed by default

#### `defaults.yaml`
Defines org-specific defaults.

Conceptually, it may include:
- default project
- default issue type
- default behavior for missing fields

#### `vocabulary.yaml`
Defines org-specific language mappings.

Conceptually, it may include:
- aliases for issue types
- common shorthand meanings
- org-specific terminology

---

## 9. Tool Exposure Model

This is critical.

### 9.1 Shared module engine may support more than what is exposed
Example:
- shared Jira core may support `delete issue`
- but an org may only expose `search`, `create`, `update`, `comment`

That is safe **only if tool registration is explicit**.

### 9.2 Only registered tools are callable
Pi can only call tools that are registered into that org session.

So the rule is:

> Do not rely on prompt instructions to restrict a dangerous tool.
> Restrict it by not registering it.

### 9.3 Recommended policy
- keep dangerous tools disabled by default
- only register tools explicitly listed in the org module manifest
- reject unknown tool names at startup
- use allowlists, not blocklists

---

## 10. Safety Model

### 10.1 Isolation by process
Each org runs in a separate OS process.

This means:
- separate memory
- separate environment variables
- separate WhatsApp session
- separate runtime state

### 10.2 Isolation by credentials
Each org process loads only its own `.env`.

For a starter Jira setup, that means:
- one Jira user/token per org
- that Jira user only has access to that org’s projects

### 10.3 Isolation by tool registration
Even within an org, the model only gets the tools explicitly registered for that org.

### 10.4 No general coding tools
Business agents should not receive coding tools.

This prevents the model from:
- reading source files
- modifying runtime files
- calling arbitrary APIs through shell commands
- inspecting secrets through local files
- changing its own environment

### 10.5 Controlled Pi runtime
The runtime should be initialized in a controlled way.

Recommended approach:
- use Pi SDK directly
- explicitly pass selected tools
- avoid surprise global/project auto-loaded tools
- do not expose reload/install/runtime mutation capabilities

---

## 11. WhatsApp Runtime Model

Each org agent has its own Baileys linked-device session.

```text
orgs/<org>/wa-session/
```

That session is used only by that org process.

Message flow:
1. WhatsApp message arrives
2. message is normalized
3. media is preprocessed if needed
4. message is pushed into the org queue
5. queue processes one message at a time
6. Pi agent responds using registered tools
7. reply is sent back to WhatsApp

Sequential processing is intentional for v1 because it reduces race conditions and keeps behavior predictable.

---

## 12. Prompt Composition

The final prompt seen by Pi should be composed from multiple layers.

### 12.1 Base platform prompt
Shared rules for all org agents.

Examples of intent:
- be concise
- ask clarifying questions when needed
- do not assume missing critical details
- use available tools instead of guessing

### 12.2 Org system prompt
Defined in:

```text
orgs/<org>/system-prompt.md
```

This contains org-level behavior.

Examples of intent:
- how formal replies should be
- whether to ask identity when needed
- any org-specific workflow guidance

### 12.3 Module prompt(s)
Defined in each enabled module.

Example for Jira:

```text
orgs/<org>/modules/jira/prompt.md
```

This contains capability-specific behavior for that org.

Examples of intent:
- how to interpret ticket language
- what defaults to apply
- when to ask for clarification before creating or updating issues

---

## 13. Example Walkthrough (Starter Jira Use Case)

Assume an org has only a Jira module enabled.

### Incoming WhatsApp message
> create a high priority ticket for login outage

### What happens

1. WhatsApp receives the message
2. the message enters the org queue
3. Pi receives:
   - normalized text
   - system prompt composed from base + org + Jira module prompt
   - Jira tools registered for this org
4. Pi interprets the request using the prompt and available tools
5. Pi calls the registered Jira create tool
6. the shared Jira engine performs the API call using that org’s Jira credentials
7. the result is returned to Pi
8. Pi sends a confirmation message back to WhatsApp

### Important note
Even if the shared Jira engine supports more operations internally, Pi can only use the subset registered for this org.

---

## 14. Per-Org Config Concept

At minimum, an org folder should contain:

```text
orgs/<org>/
  config.yaml
  .env
  system-prompt.md
  wa-session/
  runtime/
  modules/
```

### `config.yaml`
Org-level runtime settings.

Conceptually includes things like:
- org name/slug
- WhatsApp group id
- memory limits
- preprocessing settings

### `.env`
Secrets for that org only.

For starter Jira usage this may include:
- Jira host
- Jira email
- Jira token
- any model/image/voice API keys needed by preprocessing/runtime

### `runtime/`
Org-local runtime artifacts.

Examples:
- temporary downloaded attachments
- local logs
- transient working files

---

## 15. What Goes in `.pi`

For this architecture, `.pi` should be minimal.

### Recommended approach
Use Pi via SDK inside the host application.

That means:
- no custom extension is required initially
- no project `.pi/extensions/` is required initially
- no interactive Pi TUI dependency is required for the runtime model

### Likely Pi-related state outside the project
Pi provider auth may still live in the normal Pi auth location, depending on provider setup.

But for the org-agent runtime itself, the important state should live in the org folder, not in project-level `.pi` extensions.

### Important operational rule
Avoid relying on project-global auto-discovery for business-agent behavior.
Prefer explicit runtime setup from your host app.

---

## 16. Recommended First Version Scope

For the first production-ready version of the platform:

### Include
- one process per org
- org-local module loading
- explicit tool registration
- WhatsApp integration
- sequential queue
- starter Jira capability
- prompt layering
- per-org isolation

### Exclude for now
- general coding tools
- runtime self-modification
- implicit extension loading
- advanced module types not yet needed
- complex orchestration between orgs

Keep the first version narrow and predictable.

---

## 17. Operational Model

You can manage multiple org processes with a process manager such as PM2.

Example idea:
- start one named process per org
- restart individually
- inspect logs individually
- later move each org to its own VM if needed

The architecture supports both:
- many org processes on one machine
- one org process per VM

No architectural rewrite is needed to move from one deployment style to the other.

---

## 18. Summary

This platform should be thought of as:

> a shared org-agent runtime with org-local capability definitions

Not as:
- one big shared bot
- one giant config file
- one generic capability set for everybody

The correct model is:

- **shared platform core** for runtime concerns
- **shared module engines** for reusable capability logic
- **org-local modules** for capability selection and org-specific behavior
- **explicit tool registration** so Pi can only use what the org allows

Starter capability:
- Jira

Future capabilities can be added later using the same architecture without changing the platform model.

---

## 19. Recommended Path for the Starter Jira Capability

For the first implementation, Jira should follow this structure:

### Shared
```text
src/shared-modules/jira-core/
```

### Org-local
```text
orgs/<org>/modules/jira/
  manifest.yaml
  prompt.md
  defaults.yaml
  vocabulary.yaml
```

This gives:
- one reusable Jira engine
- per-org Jira behavior
- explicit tool control
- safe growth path for future modules

---

## 20. Final Safety Rule

The most important rule in this architecture is:

> A capability existing in code is not the same as a capability being available to Pi.

Pi only gets what is explicitly registered into its runtime for that org.

That is how the platform stays safe, isolated, and maintainable.
