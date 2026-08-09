import { Image, Typography } from "antd";
import { useTranslation } from "react-i18next";

import tbEsp32FlashESPtoolScreen from "../../../../../../assets/boxSetup/esp32_write_patched_image_with_esptools.png";
import CodeSnippet from "../../../../../common/elements/CodeSnippet";
import { CertificateIntro } from "../../../common/elements/CertificateIntro";

const { Paragraph } = Typography;

export const Step1Certificates: React.FC = () => {
    const { t } = useTranslation();

    return (
        <>
            <h3>{t("tonieboxes.boxFlashingCommon.certificates")}</h3>
            <CertificateIntro asC2Der={false} />
            <Paragraph>
                <CodeSnippet
                    language="shell"
                    code={`# extract firmware
esptool.py -b 921600 read_flash 0x0 0x800000 tb.esp32.bin
# extract certficates from firmware
mkdir certs/client_tb1/esp32
mkdir certs/client_tb1/<mac>
teddycloud --esp32-extract tb.esp32.bin --destination certs/client_tb1/esp32

# Copy box certificates to teddyCloud
cp certs/client_tb1/esp32/CLIENT.DER certs/client_tb1/<mac>/client.der
cp certs/client_tb1/esp32/PRIVATE.DER certs/client_tb1/<mac>/private.der
cp certs/client_tb1/esp32/CA.DER certs/client_tb1/<mac>/ca.der

# In case of first Toniebox setup for TeddyCloud
cp certs/client_tb1/<mac>/client.der certs/client_tb1/client.der
cp certs/client_tb1/<mac>/private.der certs/client_tb1/private.der
cp certs/client_tb1/<mac>/ca.der certs/client_tb1/ca.der

# Copy certificates to temporary dir
mkdir certs/client_tb1/esp32-fakeca
cp certs/client_tb1/esp32/CLIENT.DER certs/client_tb1/esp32-fakeca/
cp certs/client_tb1/esp32/PRIVATE.DER certs/client_tb1/esp32-fakeca/
cp certs/server_tb1/ca.der certs/client_tb1/esp32-fakeca/CA.DER`}
                />
            </Paragraph>

            <Paragraph>{t("tonieboxes.esp32BoxFlashing.legacy.checkDumpIsOk")}</Paragraph>

            <h5>{t("tonieboxes.esp32BoxFlashing.legacy.flashCAreplacement")}</h5>
            {t("tonieboxes.esp32BoxFlashing.legacy.flashCAreplacementText1")}

            <Paragraph>
                <CodeSnippet
                    language="shell"
                    code={`# copy firmware backup
cp tb.esp32.bin tb.esp32.fakeca.bin

# inject new CA into firmware
teddycloud --esp32-inject tb.esp32.fakeca.bin --source certs/client_tb1/esp32-fakeca
# modify IP/hostname (optional)
teddycloud --esp32-hostpatch tb.esp32.fakeca.bin --hostname <YOUR-IP/HOST>

# flash firmware with new CA
esptool.py -b 921600 write_flash 0x0 tb.esp32.fakeca.bin`}
                />
            </Paragraph>

            <Image
                preview={false}
                src={tbEsp32FlashESPtoolScreen}
                alt={t("tonieboxes.esp32BoxFlashing.legacy.flashESPtoolScreen")}
            />

            <Paragraph style={{ marginTop: 16 }}>
                {t("tonieboxes.esp32BoxFlashing.legacy.flashCAreplacementText2")}
            </Paragraph>
            <Paragraph>{t("tonieboxes.esp32BoxFlashing.legacy.flashCAreplacementText3")}</Paragraph>
        </>
    );
};
