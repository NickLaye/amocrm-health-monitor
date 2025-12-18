const fs = require('fs/promises');
const path = require('path');
const { createLogger } = require('../utils/logger');
const { CLIENT_ID_PATTERN } = require('../config/constants');

const logger = createLogger('AccountWriter');
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const TARGET_ENV_FILES = ['.env.production', '.env.local'];

function sanitizeValue(value) {
  if (value === undefined || value === null) {
    return '';
  }
  return String(value).replace(/\r?\n/g, '\\n').trim();
}

function ensureTrailingNewline(content) {
  return content.endsWith('\n') ? content : `${content}\n`;
}

function upsertEnvVariable(content, key, value) {
  const sanitized = sanitizeValue(value);
  const line = `${key}=${sanitized}`;
  const regex = new RegExp(`^${key}=.*$`, 'm');

  if (regex.test(content)) {
    return content.replace(regex, line);
  }

  const base = content.trim().length === 0 ? '' : ensureTrailingNewline(content);
  return `${base}${line}\n`;
}

async function readFileSafe(filePath) {
  try {
    const data = await fs.readFile(filePath, 'utf8');
    return data;
  } catch (error) {
    if (error.code === 'ENOENT') {
      return '';
    }
    throw error;
  }
}

async function writeFileSafe(filePath, content) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, 'utf8');
}

function resolveEnvFilePaths() {
  return TARGET_ENV_FILES.map((filename) => path.join(PROJECT_ROOT, filename));
}

function updateClientList(content, clientId) {
  const listMatch = content.match(/^AMOCRM_CLIENTS=(.*)$/m);
  const items = listMatch?.[1]
    ? listMatch[1].split(',').map((value) => value.trim()).filter(Boolean)
    : [];

  if (!items.includes(clientId)) {
    items.push(clientId);
  }

  return upsertEnvVariable(content, 'AMOCRM_CLIENTS', items.join(','));
}

function buildEnvPayload(input) {
  const clientKey = input.clientId;
  const prefix = (suffix) => `CLIENT_${clientKey}_${suffix}`;

  const payload = {
    [prefix('LABEL')]: input.label,
    [prefix('ENV')]: input.environment || 'production',
    [prefix('DOMAIN')]: input.amoDomain,
    [prefix('CLIENT_ID')]: input.amoClientId,
    [prefix('CLIENT_SECRET')]: input.amoClientSecret,
    [prefix('REDIRECT_URI')]: input.amoRedirectUri,
    [prefix('ACCESS_TOKEN')]: input.amoAccessToken,
    [prefix('REFRESH_TOKEN')]: input.amoRefreshToken,
    [prefix('RESPONSIBLE_EMAIL')]: input.responsibleEmail || '',
    [prefix('EMAILS')]: Array.isArray(input.emailRecipients) ? input.emailRecipients.join(',') : '',
    [prefix('MATTERMOST_WEBHOOK_URL')]: input.mattermostWebhookUrl,
    [prefix('MATTERMOST_CHANNEL')]: input.mattermostChannel,
    [prefix('NOTES')]: input.notes || '',
  };

  return payload;
}

async function persistClientConfig(config) {
  if (!config?.clientId || !CLIENT_ID_PATTERN.test(config.clientId)) {
    throw new Error('Некорректный clientId — допускаются буквы, цифры, # . _ - (до 64 символов)');
  }

  const normalized = {
    ...config,
    clientId: config.clientId.trim(),
  };
  const envEntries = buildEnvPayload(normalized);
  const envFiles = resolveEnvFilePaths();

  await Promise.all(
    envFiles.map(async (filePath) => {
      let content = await readFileSafe(filePath);
      content = updateClientList(content, normalized.clientId);

      Object.entries(envEntries).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          content = upsertEnvVariable(content, key, value);
        }
      });

      await writeFileSafe(filePath, content);
      logger.info(`Обновлен ${path.relative(PROJECT_ROOT, filePath)} для клиента ${normalized.clientId}`);
    })
  );

  return {
    clientId: normalized.clientId,
    files: envFiles,
  };
}

module.exports = {
  persistClientConfig,
};

