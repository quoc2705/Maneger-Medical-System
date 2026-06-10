from django.db import migrations, models


def chuyen_chuc_vu_cu(apps, schema_editor):
    NhanVien = apps.get_model('nguoidung', 'NhanVien')
    NhanVien.objects.filter(chuc_vu='KHO').update(chuc_vu='KE_TOAN')
    NhanVien.objects.filter(chuc_vu='DIEU_DUONG').update(chuc_vu='LE_TAN')


class Migration(migrations.Migration):

    dependencies = [
        ('nguoidung', '0004_alter_doctorschedule_options_and_more'),
    ]

    operations = [
        migrations.RunPython(chuyen_chuc_vu_cu, migrations.RunPython.noop),
        migrations.AlterField(
            model_name='nhanvien',
            name='chuc_vu',
            field=models.CharField(
                choices=[
                    ('BAN_THUOC', 'Bán thuốc'),
                    ('LE_TAN', 'Lễ tân'),
                    ('KE_TOAN', 'Kế toán'),
                ],
                default='LE_TAN',
                max_length=20,
            ),
        ),
    ]
