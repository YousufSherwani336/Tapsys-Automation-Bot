export { createJiraClient } from './client.js';
export type { JiraClient, JiraClientOptions } from './client.js';

export { JiraError, normalizeError } from './errors.js';
export type { JiraErrorCode } from './errors.js';

// ── Existing operations ──────────────────────────────────────

export { createIssue } from './operations/createIssue.js';
export type { CreateIssueInput, CreatedIssue } from './operations/createIssue.js';

export { getIssue } from './operations/getIssue.js';
export type { JiraIssue } from './operations/getIssue.js';

export { searchIssues } from './operations/searchIssues.js';
export type { SearchIssuesOptions, SearchIssuesResult } from './operations/searchIssues.js';

export { updateIssue } from './operations/updateIssue.js';

export { addComment } from './operations/addComment.js';
export type { AddedComment } from './operations/addComment.js';

export { listTransitions } from './operations/listTransitions.js';
export type { JiraTransition, ListTransitionsResult } from './operations/listTransitions.js';

export { transitionIssue } from './operations/transitionIssue.js';

export { attachFile } from './operations/attachFile.js';
export type { AttachFileInput, AttachedFile } from './operations/attachFile.js';

// ── User & People operations ────────────────────────────────

export { searchUsers } from './operations/searchUsers.js';
export type { JiraUser, SearchUsersOptions } from './operations/searchUsers.js';

export { getUser } from './operations/getUser.js';

export { findAssignableUsers } from './operations/findAssignableUsers.js';
export type { FindAssignableUsersOptions } from './operations/findAssignableUsers.js';

export { getCurrentUser } from './operations/getCurrentUser.js';

// ── Issue lifecycle operations ──────────────────────────────

export { assignIssue } from './operations/assignIssue.js';

export { getIssueComments } from './operations/getIssueComments.js';
export type {
  IssueComment,
  GetIssueCommentsResult,
  GetIssueCommentsOptions,
} from './operations/getIssueComments.js';

export { linkIssues } from './operations/linkIssues.js';
export type { LinkIssuesInput } from './operations/linkIssues.js';

export { getLinkTypes } from './operations/getLinkTypes.js';
export type { IssueLinkType, GetLinkTypesResult } from './operations/getLinkTypes.js';

// ── Worklog operations ──────────────────────────────────────

export { addWorklog } from './operations/addWorklog.js';
export type { AddWorklogInput, WorklogEntry } from './operations/addWorklog.js';

export { getWorklogs } from './operations/getWorklogs.js';
export type { GetWorklogsResult } from './operations/getWorklogs.js';

// ── Watcher operations ──────────────────────────────────────

export { getWatchers } from './operations/getWatchers.js';
export type { WatchersResult } from './operations/getWatchers.js';

export { addWatcher } from './operations/addWatcher.js';

// ── Project operations ──────────────────────────────────────

export { listProjects } from './operations/listProjects.js';
export type { JiraProject } from './operations/listProjects.js';

export { getProject } from './operations/getProject.js';
export type { JiraProjectDetail } from './operations/getProject.js';

export { getProjectComponents } from './operations/getProjectComponents.js';
export type { ProjectComponent } from './operations/getProjectComponents.js';

export { getProjectVersions } from './operations/getProjectVersions.js';
export type { ProjectVersion } from './operations/getProjectVersions.js';

export { getProjectStatuses } from './operations/getProjectStatuses.js';
export type { ProjectStatusCategory } from './operations/getProjectStatuses.js';

// ── Metadata / Lookup operations ────────────────────────────

export { getPriorities } from './operations/getPriorities.js';
export type { JiraPriority } from './operations/getPriorities.js';

export { getIssueTypes } from './operations/getIssueTypes.js';
export type { JiraIssueType } from './operations/getIssueTypes.js';

export { getStatuses } from './operations/getStatuses.js';
export type { JiraStatus } from './operations/getStatuses.js';

export { getResolutions } from './operations/getResolutions.js';
export type { JiraResolution } from './operations/getResolutions.js';

export { getFields } from './operations/getFields.js';
export type { JiraField } from './operations/getFields.js';

// ── Label operations ────────────────────────────────────────

export { getLabels } from './operations/getLabels.js';
export type { GetLabelsResult } from './operations/getLabels.js';

// ── Permissions / Info operations ───────────────────────────

export { getMyPermissions } from './operations/getMyPermissions.js';
export type { PermissionResult, GetMyPermissionsOptions } from './operations/getMyPermissions.js';

export { getServerInfo } from './operations/getServerInfo.js';
export type { ServerInfo } from './operations/getServerInfo.js';

// ── Tool builders ───────────────────────────────────────────

export { JIRA_TOOL_BUILDERS } from './toolBuilders.js';
export type { JiraDefaults, JiraVocabulary, JiraToolContext } from './toolBuilders.js';
