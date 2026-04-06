/**
 * Xget - High-performance acceleration engine for developer resources
 * Copyright (C) Xi Xu
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 */

/**
 * Hugging Face protocol handler for Xget
 */

/**
 * Detects if a request is a Hugging Face operation.
 *
 * All requests under the /hf/ prefix are treated as Hugging Face protocol
 * requests to ensure headers like `huggingface-metadata-only` are forwarded
 * correctly. Without passthrough, stripping that header causes HuggingFace to
 * return full multi-GB model files during metadata-only checks, triggering
 * timeouts and breaking the huggingface_hub download flow.
 * @param {Request} request - The incoming request object
 * @param {URL} url - Parsed URL object
 * @returns {boolean} True if this is a Hugging Face request
 */
export function isHuggingFaceAPIRequest(request, url) {
  void request;
  return url.pathname.startsWith('/hf/');
}

/**
 * Configures headers for Hugging Face API requests.
 * @param {Headers} headers - The headers object to modify
 * @param {Request} request - The original request
 */
export function configureHuggingFaceHeaders(headers, request) {
  const authHeader = request.headers.get('Authorization');
  if (authHeader) {
    headers.set('Authorization', authHeader);
  }

  if (request.method === 'POST' && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
}
