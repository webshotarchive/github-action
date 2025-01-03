/**
 * Unit tests for the action's main functionality, src/main.js
 */
const core = require('@actions/core')
const main = require('../src/main')

// Mock the GitHub Actions core library
const debugMock = jest.spyOn(core, 'debug').mockImplementation()
const getInputMock = jest.spyOn(core, 'getInput').mockImplementation()
const setFailedMock = jest.spyOn(core, 'setFailed').mockImplementation()
const setOutputMock = jest.spyOn(core, 'setOutput').mockImplementation()

// Mock the action's main function
const runMock = jest.spyOn(main, 'run')

// Other utilities
const timeRegex = /^\d{2}:\d{2}:\d{2}/

describe('action', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('parses tags from name', () => {
    const tags = main.parseTagsFromName(
      'timechain-e2e tags-[home] -- Dashboard.png'
    )
    expect(tags[0]).toBe('home')
  })

  it('parses tags with Uploading timechain-e2e tags-[home] -- Dashboard.png', () => {
    const tags = main.parseTagsFromName(
      'Uploading timechain-e2e tags-[home] -- Dashboard.png'
    )
    expect(tags[0]).toBe('home')
  })

  it('parses multiple tags from name', () => {
    const tags = main.parseTagsFromName(
      'timechain-e2e tags-[home, mobile] -- Dashboard.png'
    )

    expect(tags).toEqual(['home', 'mobile'])
  })
  it('parses multiple tags with no space from name', () => {
    const tags = main.parseTagsFromName(
      'timechain-e2e tags-[home,mobile ] -- Dashboard.png'
    )

    expect(tags).toEqual(['home', 'mobile'])
  })

  it('fails if no input is provided', async () => {
    // Set the action's inputs as return values from core.getInput()
    getInputMock.mockImplementation(name => {
      switch (name) {
        case 'screenshotsFolder':
          throw new Error('Input required and not supplied: milliseconds')
        default:
          return ''
      }
    })

    await main.run()
    expect(runMock).toHaveReturned()

    // Verify that all of the core library functions were called correctly
    expect(setFailedMock).toHaveBeenNthCalledWith(
      1,
      'Input required and not supplied: milliseconds'
    )
  })
})
