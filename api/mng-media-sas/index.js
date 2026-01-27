const path = require('path');
const { randomUUID } = require('crypto');
const {
  BlobServiceClient,
  StorageSharedKeyCredential,
  BlobSASPermissions,
  generateBlobSASQueryParameters
} = require('@azure/storage-blob');
const { readJson } = require('../_shared/parse');
const { ok, badRequest, methodNotAllowed, response } = require('../_shared/http');
const { requireAin } = require('../_shared/ain-auth');

const ALLOWED_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif']);
const EXT_BY_TYPE = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif'
};

function isInvalidName(name) {
  return (
    !name ||
    name.length > 200 ||
    name.includes('..') ||
    name.includes('\\') ||
    name.startsWith('/') ||
    name.includes(':')
  );
}

function sanitizeFileName(name) {
  const base = name.split('/').pop().split('\\').pop();
  return base
    .replace(/[^a-zA-Z0-9.\-_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '');
}

function parseConnectionString(connectionString) {
  const parts = connectionString.split(';');
  const map = new Map();
  parts.forEach((part) => {
    if (!part) return;
    const eqIndex = part.indexOf('=');
    if (eqIndex <= 0) return;
    const key = part.slice(0, eqIndex).trim();
    const value = part.slice(eqIndex + 1).trim();
    if (key && value) {
      map.set(key, value);
    }
  });
  if (process.env.NODE_ENV !== 'production' && map.has('AccountKey')) {
    const accountKey = map.get('AccountKey');
    if (accountKey && !accountKey.endsWith('=')) {
      console.warn('AccountKey does not end with "="; verify parsing preserves trailing "=" characters.');
    }
  }
  return {
    accountName: map.get('AccountName'),
    accountKey: map.get('AccountKey')
  };
}

function buildBlobName(week, fileName, contentType) {
  const safeName = sanitizeFileName(fileName || '') || 'image';
  const extFromName = path.extname(safeName).toLowerCase();
  const extension = ALLOWED_EXTENSIONS.has(extFromName)
    ? extFromName
    : EXT_BY_TYPE[contentType?.toLowerCase()];
  if (!extension) {
    return null;
  }
  const base = extFromName ? safeName.slice(0, -extFromName.length) : safeName;
  const trimmedBase = base || 'image';
  const finalName = `${trimmedBase}${extension}`;
  return `week-${week}/${randomUUID()}-${finalName}`;
}

module.exports = async function (context, req) {
  const session = await requireAin(req, context);
  if (!session) {
    return;
  }

  if (req.method !== 'POST') {
    context.res = methodNotAllowed();
    return;
  }

  const payload = readJson(req);
  if (!payload) {
    context.res = badRequest('Invalid JSON body.');
    return;
  }

  const legacyName = typeof payload.name === 'string' ? payload.name.trim() : '';
  const legacyType = typeof payload.contentType === 'string' ? payload.contentType.trim() : '';
  const useLegacy = legacyName && legacyType && !payload.files;

  const week = Number(payload.week);
  const files = Array.isArray(payload.files) ? payload.files : [];

  if (!useLegacy) {
    if (!Number.isInteger(week)) {
      context.res = badRequest('week must be a valid integer.');
      return;
    }

    if (!files.length) {
      context.res = badRequest('files must be a non-empty array.');
      return;
    }
  }

  const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
  const containerName = process.env.AZURE_STORAGE_CONTAINER || 'media';

  if (!connectionString) {
    context.res = response(500, { ok: false, error: 'Missing storage configuration.' });
    return;
  }

  const { accountName, accountKey } = parseConnectionString(connectionString);
  if (!accountName || !accountKey) {
    context.res = response(500, { ok: false, error: 'Invalid storage connection string.' });
    return;
  }

  try {
    const credential = new StorageSharedKeyCredential(accountName, accountKey);
    const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
    const containerClient = blobServiceClient.getContainerClient(containerName);
    const uploadExpiresOn = new Date(Date.now() + 10 * 60 * 1000);
    const readExpiresOn = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);

    if (useLegacy) {
      if (isInvalidName(legacyName)) {
        context.res = badRequest('Invalid blob name.');
        return;
      }
      if (!legacyType.startsWith('image/')) {
        context.res = badRequest('Invalid content type.');
        return;
      }
      const legacyBlobClient = containerClient.getBlockBlobClient(legacyName);
      const uploadSas = generateBlobSASQueryParameters(
        {
          containerName,
          blobName: legacyName,
          permissions: BlobSASPermissions.parse('cw'),
          expiresOn: uploadExpiresOn
        },
        credential
      ).toString();

      context.res = ok({
        ok: true,
        uploadUrl: `${legacyBlobClient.url}?${uploadSas}`,
        publicUrl: legacyBlobClient.url,
        blobName: legacyName
      });
      return;
    }

    const items = files.map((file) => {
      const name = typeof file?.name === 'string' ? file.name.trim() : '';
      const contentType = typeof file?.type === 'string' ? file.type.trim() : '';

      if (isInvalidName(name)) {
        throw new Error('Invalid file name.');
      }

      if (!contentType.startsWith('image/')) {
        throw new Error('Invalid content type.');
      }

      const blobName = buildBlobName(week, name, contentType);
      if (!blobName) {
        throw new Error('Invalid file extension.');
      }

      const blobClient = containerClient.getBlockBlobClient(blobName);
      const uploadSas = generateBlobSASQueryParameters(
        {
          containerName,
          blobName,
          permissions: BlobSASPermissions.parse('cw'),
          expiresOn: uploadExpiresOn
        },
        credential
      ).toString();
      const readSas = generateBlobSASQueryParameters(
        {
          containerName,
          blobName,
          permissions: BlobSASPermissions.parse('r'),
          expiresOn: readExpiresOn
        },
        credential
      ).toString();

      return {
        blobName,
        uploadUrl: `${blobClient.url}?${uploadSas}`,
        readUrl: `${blobClient.url}?${readSas}`
      };
    });

    context.res = ok({ container: containerName, items });
  } catch (error) {
    context.log('mng-media-sas failed', error);
    context.res = response(500, { ok: false, error: 'SERVER_ERROR' });
  }
};
