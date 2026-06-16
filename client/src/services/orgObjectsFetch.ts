import { fetchOrgObjects } from './api'
import { useAppStore } from '../stores/appStore'
import { getErrorMessage } from '../utils/errorUtils'
import { formatDateWithSeconds } from '../utils/format'

/** One org-objects fetch; updates orgObjects and status (when on org-objects tab). */
export async function fetchOrgObjectsForStore (targetOrg: string): Promise<void> {
  const st = useAppStore.getState()
  if (st.objectsRequestInFlight) return
  st.setObjectsRequestInFlight(true)
  st.setStatus('Loading…', 'loading')
  try {
    const objects = await fetchOrgObjects(targetOrg)
    const next = useAppStore.getState()
    next.setOrgObjects(objects)
    const nowIso = new Date().toISOString()
    const lastStr = 'Last refreshed: ' + formatDateWithSeconds(nowIso)
    next.setStatus(lastStr, null)
  } catch (e: unknown) {
    useAppStore.getState().setStatus(getErrorMessage(e) || 'Error loading org objects', 'error')
    useAppStore.getState().setOrgObjects([])
  } finally {
    useAppStore.getState().setObjectsRequestInFlight(false)
  }
}
