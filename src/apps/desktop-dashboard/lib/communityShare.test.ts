import { describe, it, expect } from 'vitest'
import { communityShareLink, parseCommunityShare } from './communities'

const ID = '0f8fad5b-d9cb-469f-a165-70867728950e'

describe('communityShareLink / parseCommunityShare', () => {
  it('builds a link that names only the community', () => {
    expect(communityShareLink(ID)).toBe(`/home.html?joincommunity=${ID}`)
  })
  it('adds the study-room flag only when asked', () => {
    expect(communityShareLink(ID, { room: true })).toBe(`/home.html?joincommunity=${ID}&open=room`)
    expect(communityShareLink(ID, { room: false })).not.toContain('open=')
  })
  it('reads back what it wrote', () => {
    expect(parseCommunityShare(communityShareLink(ID).split('?')[1])).toEqual({ groupId: ID, openRoom: false })
    expect(parseCommunityShare(communityShareLink(ID, { room: true }).split('?')[1])).toEqual({ groupId: ID, openRoom: true })
  })
  it('ignores other links, junk and non-UUID ids', () => {
    expect(parseCommunityShare('room=' + ID)).toBeNull()
    expect(parseCommunityShare('community=abc123')).toBeNull()
    expect(parseCommunityShare('joincommunity=not-an-id')).toBeNull()
    expect(parseCommunityShare("joincommunity='; drop table x;--")).toBeNull()
    expect(parseCommunityShare('')).toBeNull()
  })
  it('does not treat the secret invite token form as a share link', () => {
    expect(parseCommunityShare('community=' + ID)).toBeNull()
  })
})
