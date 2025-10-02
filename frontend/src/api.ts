import axios from 'axios'

export const api = axios.create({ baseURL: '/api' })

export type Tx = {
  id?: number
  date: string
  merchant: string
  amount: number
  category: string
  notes?: string
}
