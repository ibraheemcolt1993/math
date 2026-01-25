const {
  BlobServiceClient,
  StorageSharedKeyCredential,
  BlobSASPermissions,
  generateBlobSASQueryParameters
} = require('@azure/storage-blob');
const { readJson } = require('../_shared/parse');
const { ok, badRequest, methodNotAllowed, response } = require('../_shared/http');

const ALLOWED_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp', '.gif'];

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

function parseConnectionString(connectionString) {
  const parts = connectionString.split(';');
  const map = new Map();
  parts.forEach((part) => {
    const [key, value] = part.split('=');
    if (key && value) {
      map.set(key, value);
    }
  });
  return {
    accountName: map.get('AccountName'),
    accountKey: map.get('AccountKey')
  };
}

module.exports = async function (context, req) {
  if (req.method !== 'POST') {
    context.res = methodNotAllowed();
    return;
  }

  const payload = readJson(req);
  if (!payload) {
    context.res = badRequest('Invalid JSON body.');
    return;
  }

  const name = typeof payload.name === 'string' ? payload.name.trim() : '';
  const contentType = typeof payload.contentType === 'string' ? payload.contentType.trim() : '';
  const extensionIndex = name.lastIndexOf('.');
  const extension = extensionIndex >= 0 ? name.slice(extensionIndex).toLowerCase() : '';

  if (isInvalidName(name)) {
    context.res = badRequest('Invalid blob name.');
    return;
  }

  if (!ALLOWED_EXTENSIONS.includes(extension)) {
    context.res = badRequest('Invalid file extension.');
    return;
  }

  if (!contentType.startsWith('image/')) {
    context.res = badRequest('Invalid content type.');
    return;
  }

  const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
  const containerName = process.env.BLOB_CONTAINER;
  const expiresMinutes = Number(process.env.SAS_EXP_MINUTES) || 15;

  if (!connectionString || !containerName) {
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
    const blobClient = containerClient.getBlockBlobClient(name);

    const expiresOn = new Date(Date.now() + expiresMinutes * 60 * 1000);
    const sasToken = generateBlobSASQueryParameters(
      {
        containerName,
        blobName: name,
        permissions: BlobSASPermissions.parse('cw'),
        expiresOn
      },
      credential
    ).toString();

    context.res = ok({
      ok: true,
      uploadUrl: `${blobClient.url}?${sasToken}`,
      publicUrl: blobClient.url,
      blobName: name
    });
  } catch (error) {
    context.res = response(500, { ok: false, error: error.message });
  }
};
