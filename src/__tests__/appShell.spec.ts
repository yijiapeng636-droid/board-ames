import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import App from '../App.vue'

describe('AI board practice shell', () => {
  it('switches between home and both games without router navigation', async () => {
    const wrapper = mount(App)
    const cards = wrapper.findAll('.game-card')
    expect(cards).toHaveLength(2)
    expect(wrapper.text()).toContain('AI 棋类练习器')

    await cards[0]!.trigger('click')
    expect(wrapper.text()).toContain('AI 五子棋')
    await wrapper.find('.back-home').trigger('click')
    expect(wrapper.text()).toContain('AI 棋类练习器')

    await wrapper.findAll('.game-card')[1]!.trigger('click')
    expect(wrapper.text()).toContain('中国象棋练习')
    expect(wrapper.findAll('[role="gridcell"]')).toHaveLength(90)
    await wrapper.find('.back-button').trigger('click')
    expect(wrapper.text()).toContain('AI 棋类练习器')
  })
})
