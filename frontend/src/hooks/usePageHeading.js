import { useContext, useLayoutEffect } from 'react'
import { PageHeadingContext } from '../components/page-heading-context'

export function useOwnsPageHeading(owned) {
  const claim = useContext(PageHeadingContext)

  useLayoutEffect(() => {
    if (!claim) return undefined
    claim(Boolean(owned))
    return () => claim(false)
  }, [claim, owned])
}
