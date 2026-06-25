const CONFIG_URL = "projects.config.json";
const OVERRIDE_KEY = "melberg_admin_override_v1";

const grid = document.getElementById("projectGrid");
const summary = document.getElementById("summary");
const status = document.getElementById("status");
const refreshButton = document.getElementById("refreshButton");

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalizeHost(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeName(value) {
  return String(value || "").trim().toLowerCase();
}

function toTitleCase(text) {
  return String(text || "")
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function loadLocalOverride() {
  try {
    const raw = localStorage.getItem(OVERRIDE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function mergeConfig(baseConfig, overrideConfig) {
  if (!overrideConfig || typeof overrideConfig !== "object") {
    return baseConfig;
  }

  return {
    ...baseConfig,
    ...overrideConfig,
    excludeRepos: Array.isArray(overrideConfig.excludeRepos)
      ? overrideConfig.excludeRepos
      : baseConfig.excludeRepos,
    excludeHosts: Array.isArray(overrideConfig.excludeHosts)
      ? overrideConfig.excludeHosts
      : baseConfig.excludeHosts,
    manualProjects: Array.isArray(overrideConfig.manualProjects)
      ? overrideConfig.manualProjects
      : baseConfig.manualProjects,
    featuredHosts: Array.isArray(overrideConfig.featuredHosts)
      ? overrideConfig.featuredHosts
      : baseConfig.featuredHosts,
    featuredRepos: Array.isArray(overrideConfig.featuredRepos)
      ? overrideConfig.featuredRepos
      : baseConfig.featuredRepos,
    liveCheck:
      overrideConfig.liveCheck && typeof overrideConfig.liveCheck === "object"
        ? { ...(baseConfig.liveCheck || {}), ...overrideConfig.liveCheck }
        : baseConfig.liveCheck,
    repoToSubdomain:
      overrideConfig.repoToSubdomain && typeof overrideConfig.repoToSubdomain === "object"
        ? overrideConfig.repoToSubdomain
        : baseConfig.repoToSubdomain
  };
}

async function fetchJson(url) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url} (${response.status})`);
  }
  return response.json();
}

async function fetchAllRepos(user) {
  const repos = [];
  let page = 1;

  while (true) {
    const url = `https://api.github.com/users/${encodeURIComponent(user)}/repos?per_page=100&page=${page}&sort=updated`;
    const chunk = await fetchJson(url);
    if (!Array.isArray(chunk) || chunk.length === 0) {
      break;
    }

    repos.push(...chunk);
    if (chunk.length < 100) {
      break;
    }
    page += 1;

    if (page > 10) break;
  }

  return repos;
}

function buildProjectsFromRepos(repos, config) {
  const excludedRepoNames = new Set((config.excludeRepos || []).map(normalizeName));
  const excludedHosts = new Set((config.excludeHosts || []).map(normalizeHost));
  const repoToSubdomain = config.repoToSubdomain || {};
  const baseDomain = String(config.baseDomain || "melberg.app").toLowerCase();

  const list = [];

  for (const repo of repos) {
    const repoName = normalizeName(repo.name);
    if (!repoName || excludedRepoNames.has(repoName)) {
      continue;
    }

    const mappedSubdomain = normalizeHost(repoToSubdomain[repo.name] || repo.name);
    if (!mappedSubdomain) continue;

    const hostname = `${mappedSubdomain}.${baseDomain}`;
    if (excludedHosts.has(hostname)) {
      continue;
    }

    list.push({
      id: `repo:${repo.id}`,
      name: repo.name,
      displayName: toTitleCase(repo.name),
      hostname,
      url: `https://${hostname}`,
      description: repo.description || "No description provided.",
      source: "github"
    });
  }

  return list;
}

function buildManualProjects(config) {
  const baseDomain = String(config.baseDomain || "melberg.app").toLowerCase();
  const list = [];

  for (const item of config.manualProjects || []) {
    const rawHost = normalizeHost(item.hostname || "");
    const hostname = rawHost || `${normalizeHost(item.subdomain)}.${baseDomain}`;

    if (!hostname || !hostname.endsWith(`.${baseDomain}`)) {
      continue;
    }

    list.push({
      id: `manual:${hostname}`,
      name: item.name || hostname.split(".")[0],
      displayName: item.name || toTitleCase(hostname.split(".")[0]),
      hostname,
      url: item.url || `https://${hostname}`,
      description: item.description || "Manual project entry.",
      source: "manual"
    });
  }

  return list;
}

function dedupeProjects(projects) {
  const map = new Map();
  for (const p of projects) {
    if (!map.has(p.hostname)) {
      map.set(p.hostname, p);
      continue;
    }

    const current = map.get(p.hostname);
    if (current.source === "github" && p.source === "manual") {
      map.set(p.hostname, p);
    }
  }
  return [...map.values()];
}

function applyFeatured(projects, config) {
  const featuredHosts = new Set((config.featuredHosts || []).map(normalizeHost));
  const featuredRepos = new Set((config.featuredRepos || []).map(normalizeName));

  return projects.map((project) => {
    const isFeatured = featuredHosts.has(normalizeHost(project.hostname))
      || featuredRepos.has(normalizeName(project.name));

    return {
      ...project,
      featured: isFeatured
    };
  });
}

function withTimeoutSignal(timeoutMs) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  return {
    signal: controller.signal,
    done: () => clearTimeout(timeoutId)
  };
}

async function checkProjectAvailability(project, timeoutMs) {
  const probeUrl = `${project.url}/?availability_probe=${Date.now()}`;
  const { signal, done } = withTimeoutSignal(timeoutMs);

  try {
    await fetch(probeUrl, {
      mode: "no-cors",
      cache: "no-store",
      signal
    });

    return {
      ...project,
      available: true
    };
  } catch {
    return {
      ...project,
      available: false
    };
  } finally {
    done();
  }
}

async function runAvailabilityChecks(projects, liveCheck) {
  const enabled = Boolean(liveCheck?.enabled);
  if (!enabled) {
    return projects.map((project) => ({ ...project, available: null }));
  }

  const timeoutMs = Number(liveCheck?.timeoutMs || 2200);
  const concurrency = Math.max(1, Number(liveCheck?.concurrency || 6));

  const checked = [];
  const queue = [...projects];
  let index = 0;

  async function worker() {
    while (index < queue.length) {
      const currentIndex = index;
      index += 1;
      const project = queue[currentIndex];
      checked[currentIndex] = await checkProjectAvailability(project, timeoutMs);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, queue.length) }, () => worker());
  await Promise.all(workers);

  return checked;
}

function sortProjects(projects, sortBy) {
  const copy = [...projects];

  copy.sort((a, b) => {
    if (a.featured !== b.featured) {
      return a.featured ? -1 : 1;
    }

    if (sortBy === "hostname") {
      return a.hostname.localeCompare(b.hostname);
    }

    return a.displayName.localeCompare(b.displayName);
  });

  return copy;
}

function renderProjects(projects) {
  if (!projects.length) {
    grid.innerHTML = [
      "<article class=\"card\">",
      "<h2>No projects found</h2>",
      "<p class=\"desc\">Check your exclusions in projects.config.json or admin override settings.</p>",
      "</article>"
    ].join("");
    return;
  }

  grid.innerHTML = projects.map((project) => {
    const classes = ["card"];
    if (project.featured) classes.push("featured");

    const featuredBadge = project.featured
      ? "<span class=\"badge featured\">Featured</span>"
      : "";

    return [
        `<article class="${classes.join(" ")}">`,
      `<p class=\"badges\">${featuredBadge}</p>`,
      `<h2>${escapeHtml(project.displayName)}</h2>`,
      `<p class=\"host\">${escapeHtml(project.hostname)}</p>`,
      `<p class=\"desc\">${escapeHtml(project.description)}</p>`,
      `<a href=\"${escapeHtml(project.url)}\" target=\"_blank\" rel=\"noopener noreferrer\">Open project</a>`,
      "</article>"
    ].join("");
  }).join("\n");
}

async function loadAndRender() {
  const started = Date.now();
  status.textContent = "Fetching config and GitHub repositories...";

  try {
    const baseConfig = await fetchJson(CONFIG_URL);
    const overrideConfig = loadLocalOverride();
    const config = mergeConfig(baseConfig, overrideConfig);

    const repos = await fetchAllRepos(config.githubUser);
    const fromRepos = buildProjectsFromRepos(repos, config);
    const fromManual = buildManualProjects(config);
    const merged = dedupeProjects([...fromRepos, ...fromManual]);
    const withFeatured = applyFeatured(merged, config);
    const withAvailability = await runAvailabilityChecks(withFeatured, config.liveCheck);
    const projects = sortProjects(
      withAvailability.filter((project) => project.available === true),
      config.sortBy
    );

    renderProjects(projects);

    const seconds = ((Date.now() - started) / 1000).toFixed(1);
    const unavailableCount = withAvailability.filter((project) => project.available !== true).length;
    const featuredCount = projects.filter((project) => project.featured).length;
    summary.textContent = `${projects.length} projects listed`;
    status.textContent = `Updated now (${seconds}s). Source: GitHub user ${config.githubUser}. Featured: ${featuredCount}. Excluded as unavailable: ${unavailableCount}.`;
  } catch (error) {
    summary.textContent = "Failed to load projects";
    status.textContent = String(error.message || error);
    grid.innerHTML = [
      "<article class=\"card\">",
      "<h2>Load failed</h2>",
      "<p class=\"desc\">Could not fetch project data. Check network/API limits and config format.</p>",
      "</article>"
    ].join("");
  }
}

refreshButton.addEventListener("click", () => {
  loadAndRender();
});

loadAndRender();
