declare module 'swagger-ui-react' {
  import { ComponentType } from 'react'

  interface SwaggerUIProps {
    url?: string
    spec?: object
    docExpansion?: 'list' | 'full' | 'none'
    defaultModelsExpandDepth?: number
    defaultModelExpandDepth?: number
    displayOperationId?: boolean
    displayRequestDuration?: boolean
    filter?: boolean | string
    maxDisplayedTags?: number
    showExtensions?: boolean
    showCommonExtensions?: boolean
    supportedSubmitMethods?: string[]
    tryItOutEnabled?: boolean
    requestInterceptor?: (req: object) => object
    responseInterceptor?: (res: object) => object
    onComplete?: () => void
    presets?: object[]
    plugins?: object[]
    layout?: string
    deepLinking?: boolean
    persistAuthorization?: boolean
  }

  const SwaggerUI: ComponentType<SwaggerUIProps>
  export default SwaggerUI
}
