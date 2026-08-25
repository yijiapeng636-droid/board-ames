import { HttpAgentTransport } from '@/ai/runtime/httpTransport'

export const gomokuAgentTransport = new HttpAgentTransport('/api/gomoku/agent')
