/**
 * Unit tests for the action's entrypoint, src/index.js
 */
const { comment } = require('../src/comment')
// Mock @actions/github
jest.mock('@actions/github', () => ({
  getOctokit: jest.fn(),
  context: {
    repo: {
      owner: 'test-owner',
      repo: 'test-repo'
    },
    issue: {
      number: 123
    },
    payload: {
      pull_request: {
        number: 123
      }
    }
  }
}))

// Mock fetch globally
global.fetch = jest.fn()

// Mock the comment module but preserve the real comment function
const mockCreateOrUpdateComment = jest.fn()

describe('comment', () => {
  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks()

    // Mock fetch to return a successful response
    global.fetch.mockResolvedValue({
      json: jest.fn().mockResolvedValue({ status: 200, message: 'Success' })
    })
  })

  it('calls createOrUpdateComment when comment is called', async () => {
    const images = [
      {
        uniqueId: 'af5a5d11-2c71-498f-a8a0-f7c5bdb7fb39',
        originalName: 'api.png',
        diffCount: 55,
        diffCommitSha: '22325935ad59e1853891831fdbd6982d32808703',
        path: 'dist/playwright/api-api-tags--tutorial--chromium/api.png',
        compareImageTimestamp: '2025-01-01T00:00:00Z',
        createdAt: '2025-01-01T00:00:00Z',
        metadata: {
          compareImage: true
        }
      },
      {
        uniqueId: 'f107b232-ba2e-4a3c-90e6-0e5cf6a48a14',
        originalName: 'foo.png',
        diffCount: 55,
        diffCommitSha: '22325935ad59e1853891831fdbd6982d32808703',
        path: 'dist/playwright/api-api-tags--tutorial--chromium/api.png',
        compareImageTimestamp: '2025-01-01T00:00:00Z',
        createdAt: '2025-01-01T00:00:00Z',
        metadata: {
          compareImage: true
        }
      },
      // new image
      {
        uniqueId: 'f107b232-ba2e-4a3c-90e6-0e5cf6a48a14',
        originalName: 'foo.png',
        diffCount: undefined,
        diffCommitSha: '22325935ad59e1853891831fdbd6982d32808703',
        path: 'dist/playwright/api-api-tags--tutorial--chromium/api.png',
        compareImageTimestamp: '2025-01-01T00:00:00Z',
        createdAt: '2025-01-01T00:00:00Z'
      },
      // error
      {
        uniqueId: 'f107b232-ba2e-4a3c-90e6-0e5cf6a48a14',
        originalName: 'foo.png',
        diffCount: 55,
        diffCommitSha: '22325935ad59e1853891831fdbd6982d32808703',
        path: 'dist/playwright/api-api-tags--tutorial--chromium/api.png',
        compareImageTimestamp: '2025-01-01T00:00:00Z',
        createdAt: '2025-01-01T00:00:00Z',
        metadata: {
          compareImage: true
        },
        error: 'Image sizes'
      }
    ]

    const table = await comment({
      images,
      commitSha: '7f6e1ce5750902207e95e22eea01326964ac548a',
      message: 'test',
      projectId: 'test',
      failedTestRegex: /failed/,
      clientId: 'test',
      clientSecret: 'test'
    })
    console.log('table', table)

    // Verify fetch was called with the correct parameters
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.webshotarchive.com/api/github/actions/comment/test',
      expect.objectContaining({
        method: 'POST',
        headers: {
          'x-client-id': 'test',
          'x-client-secret': 'test',
          'Content-Type': 'application/json'
        }
      })
    )

    expect(table).toContain('api.png')
  })
})
