export default {
  meta: { name: 'loutre' },
  rules: {
    'no-unknown-assertion': {
      meta: {
        type: 'problem',
        schema: [],
        messages: {
          forbidden:
            'unknownへの型assertionは禁止です。入力の検証、型付きの値の構築、または型宣言の修正で解決してください。',
        },
      },
      create(context) {
        const check = (node) => {
          let annotation = node.typeAnnotation
          while (annotation.type === 'TSParenthesizedType')
            annotation = annotation.typeAnnotation
          if (annotation.type === 'TSUnknownKeyword')
            context.report({ node, messageId: 'forbidden' })
        }
        return { TSAsExpression: check, TSTypeAssertion: check }
      },
    },
  },
}
