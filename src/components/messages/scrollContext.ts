import { createContext, useContext } from 'react'

/** 列表跟随最新回复，用户主动阅读上方内容时暂停。 */
export const MessageScrollContext = createContext({
  scrollToBottom: () => {},
  pauseFollowing: () => {},
})

export const useScrollToBottom = () => useContext(MessageScrollContext).scrollToBottom
export const usePauseFollowing = () => useContext(MessageScrollContext).pauseFollowing
