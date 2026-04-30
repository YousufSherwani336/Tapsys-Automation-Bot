import { z } from 'zod';
import type { ToolDefinition } from '../../types/index.js';
import type { JiraClient } from './client.js';
import { createIssue } from './operations/createIssue.js';
import { getIssue } from './operations/getIssue.js';
import { searchIssues } from './operations/searchIssues.js';
import { updateIssue } from './operations/updateIssue.js';
import { addComment } from './operations/addComment.js';
import { listTransitions } from './operations/listTransitions.js';
import { transitionIssue } from './operations/transitionIssue.js';
import { attachFile } from './operations/attachFile.js';
import { searchUsers } from './operations/searchUsers.js';
import { getUser } from './operations/getUser.js';
import { findAssignableUsers } from './operations/findAssignableUsers.js';
import { getCurrentUser } from './operations/getCurrentUser.js';
import { assignIssue } from './operations/assignIssue.js';
import { getIssueComments } from './operations/getIssueComments.js';
import { linkIssues } from './operations/linkIssues.js';
import { getLinkTypes } from './operations/getLinkTypes.js';
import { addWorklog } from './operations/addWorklog.js';
import { getWorklogs } from './operations/getWorklogs.js';
import { getWatchers } from './operations/getWatchers.js';
import { addWatcher } from './operations/addWatcher.js';
import { listProjects } from './operations/listProjects.js';
import { getProject } from './operations/getProject.js';
import { getProjectComponents } from './operations/getProjectComponents.js';
import { getProjectVersions } from './operations/getProjectVersions.js';
import { getProjectStatuses } from './operations/getProjectStatuses.js';
import { getPriorities } from './operations/getPriorities.js';
import { getIssueTypes } from './operations/getIssueTypes.js';
import { getStatuses } from './operations/getStatuses.js';
import { getResolutions } from './operations/getResolutions.js';
import { getFields } from './operations/getFields.js';
import { getLabels } from './operations/getLabels.js';
import { getMyPermissions } from './operations/getMyPermissions.js';
import { getServerInfo } from './operations/getServerInfo.js';

export interface JiraDefaults {
  defaultProject?: string;
  defaultIssueType?: string;
  defaultPriority?: string;
}

export interface JiraVocabulary {
  aliases?: {
    issueTypes?: Record<string, string>;
    statuses?: Record<string, string>;
    priorities?: Record<string, string>;
  };
}

export interface JiraToolContext {
  client: JiraClient;
  defaults: JiraDefaults;
  vocabulary: JiraVocabulary;
}

/** Resolves a user-supplied value against vocabulary aliases. Falls back to original value. */
function resolveAlias(
  value: string | undefined,
  aliases: Record<string, string> | undefined,
): string | undefined {
  if (!value) return undefined;
  if (!aliases) return value;
  // Case-insensitive alias lookup
  const lower = value.toLowerCase();
  return aliases[lower] ?? aliases[value] ?? value;
}

// The record holds builders that each return differently-typed ToolDefinitions.
// `ToolDefinition<any, any>` here is justified: each builder is individually typed
// below via Zod inference; the record itself is necessarily heterogeneous.
/* eslint-disable @typescript-eslint/no-explicit-any */
export const JIRA_TOOL_BUILDERS: Record<
  string,
  (ctx: JiraToolContext) => ToolDefinition<any, any>
> = {
  // ──────────────────────────────────────────────────────────
  // Existing tools
  // ──────────────────────────────────────────────────────────

  'jira.create_issue': (ctx) => ({
    name: 'jira.create_issue',
    description: 'Create a new Jira issue.',
    inputSchema: z.object({
      project: z.string().optional().describe('Jira project key (e.g. EX)'),
      summary: z.string().describe('Issue summary / title'),
      issueType: z.string().optional().describe('Issue type (e.g. Task, Bug, Story)'),
      priority: z.string().optional().describe('Priority (e.g. High, Medium, Low)'),
      description: z.string().optional().describe('Long-form description'),
      assignee: z.string().optional().describe('Assignee Jira account ID'),
      labels: z.array(z.string()).optional().describe('Labels to attach'),
    }),
    handler: async (input) => {
      const { aliases } = ctx.vocabulary;
      const project = input.project ?? ctx.defaults.defaultProject;
      if (!project) throw new Error('jira.create_issue: project is required');

      const issueType =
        resolveAlias(input.issueType, aliases?.issueTypes) ??
        ctx.defaults.defaultIssueType;
      if (!issueType) throw new Error('jira.create_issue: issueType is required');

      const priority =
        resolveAlias(input.priority, aliases?.priorities) ??
        ctx.defaults.defaultPriority;

      return createIssue(ctx.client, {
        project,
        summary: input.summary,
        issueType,
        priority,
        description: input.description,
        assignee: input.assignee,
        labels: input.labels,
      });
    },
  }),

  'jira.get_issue': (ctx) => ({
    name: 'jira.get_issue',
    description: 'Retrieve a Jira issue by its key.',
    inputSchema: z.object({
      key: z.string().describe('Jira issue key (e.g. EX-123)'),
    }),
    handler: async (input) => getIssue(ctx.client, input.key),
  }),

  'jira.search_issues': (ctx) => ({
    name: 'jira.search_issues',
    description: 'Search Jira issues using JQL.',
    inputSchema: z.object({
      jql: z.string().describe('JQL query string'),
      fields: z.array(z.string()).optional().describe('Fields to return'),
      maxResults: z.number().int().positive().optional().describe('Max results'),
    }),
    handler: async (input) =>
      searchIssues(ctx.client, input.jql, {
        fields: input.fields,
        maxResults: input.maxResults,
      }),
  }),

  'jira.update_issue': (_ctx) => ({
    name: 'jira.update_issue',
    description: 'Update fields on an existing Jira issue.',
    inputSchema: z.object({
      key: z.string().describe('Jira issue key'),
      fields: z.record(z.unknown()).describe('Fields to update (Jira field names as keys)'),
    }),
    handler: async (input) => {
      await updateIssue(_ctx.client, input.key, input.fields);
      return { updated: true, key: input.key };
    },
  }),

  'jira.add_comment': (_ctx) => ({
    name: 'jira.add_comment',
    description: 'Add a comment to a Jira issue.',
    inputSchema: z.object({
      key: z.string().describe('Jira issue key'),
      body: z.string().describe('Comment text'),
    }),
    handler: async (input) => addComment(_ctx.client, input.key, input.body),
  }),

  'jira.list_transitions': (_ctx) => ({
    name: 'jira.list_transitions',
    description: 'List available workflow transitions for a Jira issue.',
    inputSchema: z.object({
      key: z.string().describe('Jira issue key'),
    }),
    handler: async (input) => listTransitions(_ctx.client, input.key),
  }),

  'jira.transition_issue': (_ctx) => ({
    name: 'jira.transition_issue',
    description: 'Move a Jira issue to a new workflow state via a transition.',
    inputSchema: z.object({
      key: z.string().describe('Jira issue key'),
      transitionId: z.string().describe('Transition ID (from list_transitions)'),
    }),
    handler: async (input) => {
      await transitionIssue(_ctx.client, input.key, input.transitionId);
      return { transitioned: true, key: input.key, transitionId: input.transitionId };
    },
  }),

  'jira.attach_file': (_ctx) => ({
    name: 'jira.attach_file',
    description: 'Attach a file to a Jira issue.',
    inputSchema: z.object({
      key: z.string().describe('Jira issue key'),
      filename: z.string().describe('File name'),
      base64Content: z.string().describe('Base64-encoded file content'),
      contentType: z.string().describe('MIME type (e.g. image/png)'),
    }),
    handler: async (input) => {
      const buffer = Buffer.from(input.base64Content, 'base64');
      return attachFile(_ctx.client, input.key, {
        filename: input.filename,
        buffer,
        contentType: input.contentType,
      });
    },
  }),

  // ──────────────────────────────────────────────────────────
  // User & People tools
  // ──────────────────────────────────────────────────────────

  'jira.search_users': (_ctx) => ({
    name: 'jira.search_users',
    description: 'Search Jira users by username or display name.',
    inputSchema: z.object({
      query: z.string().describe('Username or display name to search for'),
      maxResults: z.number().int().positive().optional().describe('Max results to return'),
    }),
    handler: async (input) =>
      searchUsers(_ctx.client, input.query, { maxResults: input.maxResults }),
  }),

  'jira.get_user': (_ctx) => ({
    name: 'jira.get_user',
    description: 'Get details of a specific Jira user by username.',
    inputSchema: z.object({
      username: z.string().describe('Jira username'),
    }),
    handler: async (input) => getUser(_ctx.client, input.username),
  }),

  'jira.find_assignable_users': (ctx) => ({
    name: 'jira.find_assignable_users',
    description: 'Find users that can be assigned to issues in a project or a specific issue.',
    inputSchema: z.object({
      project: z.string().optional().describe('Project key to find assignable users for'),
      issueKey: z.string().optional().describe('Issue key to find assignable users for'),
      username: z.string().optional().describe('Filter by username/display name'),
      maxResults: z.number().int().positive().optional().describe('Max results'),
    }),
    handler: async (input) => {
      const project = input.project ?? ctx.defaults.defaultProject;
      return findAssignableUsers(ctx.client, {
        project,
        issueKey: input.issueKey,
        username: input.username,
        maxResults: input.maxResults,
      });
    },
  }),

  'jira.get_current_user': (_ctx) => ({
    name: 'jira.get_current_user',
    description: 'Get the currently authenticated Jira user.',
    inputSchema: z.object({}),
    handler: async () => getCurrentUser(_ctx.client),
  }),

  // ──────────────────────────────────────────────────────────
  // Issue lifecycle tools
  // ──────────────────────────────────────────────────────────

  'jira.assign_issue': (_ctx) => ({
    name: 'jira.assign_issue',
    description: 'Assign a Jira issue to a user.',
    inputSchema: z.object({
      key: z.string().describe('Jira issue key'),
      username: z.string().describe('Username to assign the issue to'),
    }),
    handler: async (input) => {
      await assignIssue(_ctx.client, input.key, input.username);
      return { assigned: true, key: input.key, username: input.username };
    },
  }),

  'jira.get_issue_comments': (_ctx) => ({
    name: 'jira.get_issue_comments',
    description: 'List all comments on a Jira issue.',
    inputSchema: z.object({
      key: z.string().describe('Jira issue key'),
      maxResults: z.number().int().positive().optional().describe('Max comments to return'),
    }),
    handler: async (input) =>
      getIssueComments(_ctx.client, input.key, { maxResults: input.maxResults }),
  }),

  'jira.link_issues': (_ctx) => ({
    name: 'jira.link_issues',
    description: 'Create a link between two Jira issues.',
    inputSchema: z.object({
      type: z.string().describe('Link type name (e.g. Blocks, Duplicate, Relates)'),
      inwardIssueKey: z.string().describe('Inward issue key (e.g. EX-1)'),
      outwardIssueKey: z.string().describe('Outward issue key (e.g. EX-2)'),
      comment: z.string().optional().describe('Optional comment for the link'),
    }),
    handler: async (input) => {
      await linkIssues(_ctx.client, {
        type: input.type,
        inwardIssueKey: input.inwardIssueKey,
        outwardIssueKey: input.outwardIssueKey,
        comment: input.comment,
      });
      return {
        linked: true,
        type: input.type,
        inward: input.inwardIssueKey,
        outward: input.outwardIssueKey,
      };
    },
  }),

  'jira.get_link_types': (_ctx) => ({
    name: 'jira.get_link_types',
    description: 'List available issue link types.',
    inputSchema: z.object({}),
    handler: async () => getLinkTypes(_ctx.client),
  }),

  // ──────────────────────────────────────────────────────────
  // Worklog tools
  // ──────────────────────────────────────────────────────────

  'jira.add_worklog': (_ctx) => ({
    name: 'jira.add_worklog',
    description: 'Log time spent on a Jira issue.',
    inputSchema: z.object({
      key: z.string().describe('Jira issue key'),
      timeSpent: z.string().describe('Time spent (e.g. "2h 30m", "1d")'),
      comment: z.string().optional().describe('Worklog comment'),
      started: z.string().optional().describe('Start date-time in ISO 8601 format'),
    }),
    handler: async (input) =>
      addWorklog(_ctx.client, input.key, {
        timeSpent: input.timeSpent,
        comment: input.comment,
        started: input.started,
      }),
  }),

  'jira.get_worklogs': (_ctx) => ({
    name: 'jira.get_worklogs',
    description: 'Get all worklogs for a Jira issue.',
    inputSchema: z.object({
      key: z.string().describe('Jira issue key'),
    }),
    handler: async (input) => getWorklogs(_ctx.client, input.key),
  }),

  // ──────────────────────────────────────────────────────────
  // Watcher tools
  // ──────────────────────────────────────────────────────────

  'jira.get_watchers': (_ctx) => ({
    name: 'jira.get_watchers',
    description: 'List watchers on a Jira issue.',
    inputSchema: z.object({
      key: z.string().describe('Jira issue key'),
    }),
    handler: async (input) => getWatchers(_ctx.client, input.key),
  }),

  'jira.add_watcher': (_ctx) => ({
    name: 'jira.add_watcher',
    description: 'Add a watcher to a Jira issue.',
    inputSchema: z.object({
      key: z.string().describe('Jira issue key'),
      username: z.string().describe('Username of the watcher to add'),
    }),
    handler: async (input) => {
      await addWatcher(_ctx.client, input.key, input.username);
      return { added: true, key: input.key, username: input.username };
    },
  }),

  // ──────────────────────────────────────────────────────────
  // Project tools
  // ──────────────────────────────────────────────────────────

  'jira.list_projects': (_ctx) => ({
    name: 'jira.list_projects',
    description: 'List all accessible Jira projects.',
    inputSchema: z.object({}),
    handler: async () => listProjects(_ctx.client),
  }),

  'jira.get_project': (_ctx) => ({
    name: 'jira.get_project',
    description: 'Get details of a Jira project by key or ID.',
    inputSchema: z.object({
      key: z.string().describe('Project key or ID'),
    }),
    handler: async (input) => getProject(_ctx.client, input.key),
  }),

  'jira.get_project_components': (_ctx) => ({
    name: 'jira.get_project_components',
    description: 'List components of a Jira project.',
    inputSchema: z.object({
      key: z.string().describe('Project key or ID'),
    }),
    handler: async (input) => getProjectComponents(_ctx.client, input.key),
  }),

  'jira.get_project_versions': (_ctx) => ({
    name: 'jira.get_project_versions',
    description: 'List versions/releases of a Jira project.',
    inputSchema: z.object({
      key: z.string().describe('Project key or ID'),
    }),
    handler: async (input) => getProjectVersions(_ctx.client, input.key),
  }),

  'jira.get_project_statuses': (_ctx) => ({
    name: 'jira.get_project_statuses',
    description: 'Get available statuses per issue type in a Jira project.',
    inputSchema: z.object({
      key: z.string().describe('Project key or ID'),
    }),
    handler: async (input) => getProjectStatuses(_ctx.client, input.key),
  }),

  // ──────────────────────────────────────────────────────────
  // Metadata / Lookup tools
  // ──────────────────────────────────────────────────────────

  'jira.get_priorities': (_ctx) => ({
    name: 'jira.get_priorities',
    description: 'List all available Jira priorities.',
    inputSchema: z.object({}),
    handler: async () => getPriorities(_ctx.client),
  }),

  'jira.get_issue_types': (_ctx) => ({
    name: 'jira.get_issue_types',
    description: 'List all Jira issue types.',
    inputSchema: z.object({}),
    handler: async () => getIssueTypes(_ctx.client),
  }),

  'jira.get_statuses': (_ctx) => ({
    name: 'jira.get_statuses',
    description: 'List all Jira statuses.',
    inputSchema: z.object({}),
    handler: async () => getStatuses(_ctx.client),
  }),

  'jira.get_resolutions': (_ctx) => ({
    name: 'jira.get_resolutions',
    description: 'List all Jira resolutions.',
    inputSchema: z.object({}),
    handler: async () => getResolutions(_ctx.client),
  }),

  'jira.get_fields': (_ctx) => ({
    name: 'jira.get_fields',
    description: 'List all Jira fields (system and custom).',
    inputSchema: z.object({}),
    handler: async () => getFields(_ctx.client),
  }),

  // ──────────────────────────────────────────────────────────
  // Label tools
  // ──────────────────────────────────────────────────────────

  'jira.get_labels': (_ctx) => ({
    name: 'jira.get_labels',
    description: 'List all labels in Jira.',
    inputSchema: z.object({
      maxResults: z.number().int().positive().optional().describe('Max labels to return'),
    }),
    handler: async (input) => getLabels(_ctx.client, input.maxResults),
  }),

  // ──────────────────────────────────────────────────────────
  // Permissions / Info tools
  // ──────────────────────────────────────────────────────────

  'jira.get_my_permissions': (_ctx) => ({
    name: 'jira.get_my_permissions',
    description: 'Check current user permissions on a project or issue.',
    inputSchema: z.object({
      projectKey: z.string().optional().describe('Project key to scope permissions'),
      issueKey: z.string().optional().describe('Issue key to scope permissions'),
    }),
    handler: async (input) =>
      getMyPermissions(_ctx.client, {
        projectKey: input.projectKey,
        issueKey: input.issueKey,
      }),
  }),

  'jira.get_server_info': (_ctx) => ({
    name: 'jira.get_server_info',
    description: 'Get Jira server information (version, URL, etc.).',
    inputSchema: z.object({}),
    handler: async () => getServerInfo(_ctx.client),
  }),
};
/* eslint-enable @typescript-eslint/no-explicit-any */
