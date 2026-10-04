// @vitest-environment jsdom
import {fireEvent,render,screen,waitFor,cleanup} from '@testing-library/react'
import {afterEach,expect,it,vi} from 'vitest'
const {publish,withdraw}=vi.hoisted(()=>({publish:vi.fn(),withdraw:vi.fn()}))
vi.mock('@/lib/guides/versions',()=>({publishStructuredGuide:publish,withdrawStructuredGuide:withdraw}))
import {StructuredGuideForm} from '@/components/kinnso/StructuredGuideForm'
afterEach(()=>{cleanup();vi.clearAllMocks()})
it('publication transport rejection preserves content and retries the same request intent',async()=>{
 publish.mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce({ok:true,data:{version:1}})
 render(<StructuredGuideForm id="synthetic" locale="en"/>);fireEvent.change(screen.getByLabelText('Stop title'),{target:{value:'Retained instructions'}});const button=screen.getByRole('button',{name:'Publish structured version'})
 fireEvent.click(button);await waitFor(()=>expect((button as HTMLButtonElement).disabled).toBe(false));expect(screen.getByRole('status').textContent).toContain('kept')
 fireEvent.click(button);await waitFor(()=>expect(screen.getByRole('status').textContent).toContain('Version published'))
 expect(publish.mock.calls[1][2]).toBe(publish.mock.calls[0][2]);expect(publish.mock.calls[1][3]).toEqual(publish.mock.calls[0][3])
})
it('withdrawal transport rejection releases the control for retry',async()=>{
 withdraw.mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce({ok:true})
 render(<StructuredGuideForm id="synthetic" locale="en"/>);const button=screen.getByRole('button',{name:'Withdraw adoption'});fireEvent.click(button);await waitFor(()=>expect((button as HTMLButtonElement).disabled).toBe(false));fireEvent.click(button);await waitFor(()=>expect(screen.getByRole('status').textContent).toContain('withdrawn'))
})
