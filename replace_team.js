
const { createClient } = require('@supabase/supabase-js')

const supabaseUrl = 'https://bqfcfqflodpewdssicak.supabase.co'
const supabaseKey = 'sb_publishable_2par32BiPa4FahajE_7vog_XbZ46--K'

const supabase = createClient(supabaseUrl, supabaseKey)

async function testUpdate() {
    console.log('Testing update...');
    const { data, error, count } = await supabase
        .from('teams')
        .update({ name: 'ARGENTINA U23 (ARG)' })
        .eq('name', "MAYO'S (MEX)")
        .select()

    if (error) {
        console.error('Error:', error);
    } else {
        console.log('Update result data:', data);
        console.log('Update result count:', count);
    }
}

testUpdate()
