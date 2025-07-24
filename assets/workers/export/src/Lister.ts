import type { ITag } from '~/types/Tag'
import XLSX from 'xlsx'
import { TRANSLATION_LANGUAGES } from '~/constants'

const SHEET_HEADER = ['id', 'pic', 'key', 'origin'].concat(
  TRANSLATION_LANGUAGES.map((lang) => lang.value)
)

class Lister {
  private vueAoo: any[] = []
  private reactAoo: any[] = []

  public setTags(tags: Array<ITag & { pic: string }>) {
    console.log('lister all tags', tags)
    tags.forEach((tag) => {
      this.vueAoo.push({
        id: tag.id,
        pic: tag.pic,
        key: tag.i18nKey,
        origin: tag.translation?.origin,
        ...TRANSLATION_LANGUAGES.reduce((acc, lang) => {
          acc[lang.value] = tag.translation?.vue?.[lang.value]
          return acc
        }, {} as Record<string, string | undefined>),
      })
      this.reactAoo.push({
        id: tag.id,
        pic: tag.pic,
        key: tag.i18nKey,
        origin: tag.translation?.origin,
        ...TRANSLATION_LANGUAGES.reduce((acc, lang) => {
          acc[lang.value] = tag.translation?.react?.[lang.value]
          return acc
        }, {} as Record<string, string | undefined>),
      })
    })
  }

  public async generateJson() {
    //TODO: generate json
    return Promise.resolve(null)
  }

  public async generateXlsx() {
    return new Promise((resolve, reject) => {
      try {
        console.log('lister generate xlsx')
        const workbook = XLSX.utils.book_new()
        const vueSheet = XLSX.utils.aoa_to_sheet([SHEET_HEADER])
        const reactSheet = XLSX.utils.aoa_to_sheet([SHEET_HEADER])

        workbook.SheetNames.push('vue', 'react')
        workbook.Sheets['vue'] = vueSheet
        workbook.Sheets['react'] = reactSheet

        XLSX.utils.sheet_add_json(vueSheet, this.vueAoo, {
          origin: -1,
          skipHeader: true,
        })
        XLSX.utils.sheet_add_json(reactSheet, this.reactAoo, {
          origin: -1,
          skipHeader: true,
        })
        const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' })
        resolve(new Blob([buffer], { type: 'application/octet-stream' }))
      } catch (error) {
        reject(error)
      }
    })
  }
}

export { Lister }
